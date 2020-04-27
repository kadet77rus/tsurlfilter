import { Request } from '../request';
import { NetworkRule } from '../rules/network-rule';
import { MatchingResult } from './matching-result';
import { fastHash, fastHashBetween } from '../utils/utils';
import { RuleStorage } from '../filterlist/rule-storage';

/**
 * NetworkEngine is the engine that supports quick search over network rules
 */
export class NetworkEngine {
    /**
     * Rule shortcut max length
     */
    private static SHORTCUT_LENGTH = 5;

    /**
     * Limit the URL length with 4KB.
     * It appears that there can be URLs longer than a megabyte and it makes no sense to go through the whole URL
     * @type {number}
     */
    private static MAX_URL_LENGTH: number = 4 * 1024;

    /**
     * Count of rules added to the engine
     */
    public rulesCount: number;

    /**
     * Storage for the network filtering rules
     */
    private ruleStorage: RuleStorage;

    /**
     * Domain lookup table. Key is the domain name hash.
     */
    private readonly domainsLookupTable: Map<number, number[]>;

    /**
     * Shortcuts lookup table. Key is the shortcut hash.
     */
    private readonly shortcutsLookupTable: Map<number, number[]>;

    /**
     * Shortcuts histogram helps us choose the best shortcut for the shortcuts lookup table.
     */
    private readonly shortcutsHistogram: Map<number, number>;

    /**
     * Rules for which we could not find a shortcut and could not place it to the shortcuts lookup table.
     */
    private otherRules: NetworkRule[];

    /**
     * Builds an instance of the network engine
     *
     * @param storage
     */
    constructor(storage: RuleStorage) {
        this.ruleStorage = storage;
        this.rulesCount = 0;
        this.domainsLookupTable = new Map<number, number[]>();
        this.shortcutsLookupTable = new Map<number, number[]>();
        this.shortcutsHistogram = new Map<number, number>();
        this.otherRules = [];

        const scanner = this.ruleStorage.createRuleStorageScanner();

        while (scanner.scan()) {
            const indexedRule = scanner.getRule();
            if (indexedRule
                && indexedRule.rule instanceof NetworkRule) {
                this.addRule(indexedRule.rule, indexedRule.index);
            }
        }
    }

    /**
     * Match searches over all filtering rules loaded to the engine
     * It returns rule if a match was found alongside the matching rule
     *
     * @param request to check
     * @return rule matching request or null
     */
    match(request: Request): NetworkRule | null {
        const networkRules = this.matchAll(request);

        if (networkRules.length === 0) {
            return null;
        }

        const result = new MatchingResult(networkRules, null);
        return result.getBasicResult();
    }

    /**
     * Finds all rules matching the specified request regardless of the rule types
     * It will find both whitelist and blacklist rules
     *
     * @param request to check
     * @return array of matching rules
     */
    matchAll(request: Request): NetworkRule[] {
        // First check by shortcuts
        const result = this.matchShortcutsLookupTable(request);
        result.push(...this.matchDomainsLookupTable(request));

        // Now check other rules
        this.otherRules.forEach((r) => {
            if (r.match(request)) {
                result.push(r);
            }
        });

        return result;
    }

    /**
     * Finds all matching rules from the shortcuts lookup table
     *
     * @param request to check
     * @return array of matching rules
     */
    private matchShortcutsLookupTable(request: Request): NetworkRule[] {
        const result: NetworkRule[] = [];

        let urlLen = request.urlLowercase.length;
        if (urlLen > NetworkEngine.MAX_URL_LENGTH) {
            urlLen = NetworkEngine.MAX_URL_LENGTH;
        }

        for (let i = 0; i <= urlLen - NetworkEngine.SHORTCUT_LENGTH; i += 1) {
            const hash = fastHashBetween(request.urlLowercase, i, i + NetworkEngine.SHORTCUT_LENGTH);
            const rulesIndexes = this.shortcutsLookupTable.get(hash);
            if (rulesIndexes) {
                rulesIndexes.forEach((ruleIdx) => {
                    const rule = this.ruleStorage.retrieveNetworkRule(ruleIdx);
                    if (rule && rule.match(request)) {
                        result.push(rule);
                    }
                });
            }
        }

        return result;
    }

    /**
     * Finds all matching rules from the domains lookup table
     *
     * @param request to check
     * @return array of matching rules
     */
    private matchDomainsLookupTable(request: Request): NetworkRule[] {
        const result: NetworkRule[] = [];

        if (!request.sourceHostname) {
            return result;
        }

        const domains = NetworkEngine.getSubdomains(request.sourceHostname);
        domains.forEach((domain) => {
            const hash = fastHash(domain);
            const rulesIndexes = this.domainsLookupTable.get(hash);
            if (rulesIndexes) {
                rulesIndexes.forEach((ruleIdx) => {
                    const rule = this.ruleStorage.retrieveNetworkRule(ruleIdx);
                    if (rule && rule.match(request)) {
                        result.push(rule);
                    }
                });
            }
        });

        return result;
    }

    /**
     * Adds rule to the network engine
     *
     * @param rule
     * @param storageIdx
     */
    private addRule(rule: NetworkRule, storageIdx: number): void {
        if (!this.addRuleToShortcutsTable(rule, storageIdx)) {
            if (!this.addRuleToDomainsTable(rule, storageIdx)) {
                if (!this.otherRules.includes(rule)) {
                    this.otherRules.push(rule);
                }
            }
        }

        this.rulesCount += 1;
    }

    /**
     * Tries to add the rule to the domains lookup table.
     * returns true if it was added
     *
     * @param rule to add
     * @param storageIdx index
     * @return {boolean} true if the rule been added
     */
    private addRuleToShortcutsTable(rule: NetworkRule, storageIdx: number): boolean {
        const shortcuts = NetworkEngine.getRuleShortcuts(rule);
        if (!shortcuts || shortcuts.length === 0) {
            return false;
        }

        // Find the applicable shortcut (the least used)
        let shortcutHash = -1;
        // Max int32
        let minCount = 2147483647;

        shortcuts.forEach((shortcutToCheck) => {
            const hash = fastHash(shortcutToCheck);
            let count = this.shortcutsHistogram.get(hash);
            if (!count) {
                count = 0;
            }

            if (count < minCount) {
                minCount = count;
                shortcutHash = hash;
            }
        });

        // Increment the histogram
        this.shortcutsHistogram.set(shortcutHash, minCount + 1);

        // Add the rule to the lookup table
        let rulesIndexes = this.shortcutsLookupTable.get(shortcutHash);
        if (!rulesIndexes) {
            rulesIndexes = [];
        }
        rulesIndexes.push(storageIdx);

        this.shortcutsLookupTable.set(shortcutHash, rulesIndexes);

        return true;
    }

    /**
     * Returns a list of shortcuts that can be used for the lookup table
     *
     * @param rule
     * @return array of shortcuts or null
     */
    private static getRuleShortcuts(rule: NetworkRule): string[] | null {
        const shortcut = rule.getShortcut();
        if (shortcut.length < NetworkEngine.SHORTCUT_LENGTH) {
            return null;
        }

        if (NetworkEngine.isAnyURLShortcut(rule)) {
            return null;
        }

        const result: string[] = [];
        for (let i = 0; i < shortcut.length - NetworkEngine.SHORTCUT_LENGTH; i += 1) {
            const s = shortcut.substring(i, i + NetworkEngine.SHORTCUT_LENGTH);
            result.push(s);
        }

        return result;
    }

    /**
     * Checks if the rule potentially matches too many URLs.
     * We'd better use another type of lookup table for this kind of rules.
     *
     * @param rule to check
     * @return check result
     */
    private static isAnyURLShortcut(rule: NetworkRule): boolean {
        const shortcut = rule.getShortcut();

        // The numbers are basically ("PROTO://".length + 1)
        if (shortcut.length < 6 && shortcut.indexOf('ws:') === 0) {
            return true;
        }

        if (shortcut.length < 7 && shortcut.indexOf('|ws') === 0) {
            return true;
        }

        if (shortcut.length < 9 && shortcut.indexOf('http') === 0) {
            return true;
        }

        return !!(shortcut.length < 10 && shortcut.indexOf('|http') === 0);
    }

    /**
     * Tries to add the rule to the shortcuts table.
     * returns true if it was added or false if the shortcut is too short
     *
     * @param rule to add
     * @param storageIdx index
     * @return {boolean} true if the rule been added
     */
    private addRuleToDomainsTable(rule: NetworkRule, storageIdx: number): boolean {
        const permittedDomains = rule.getPermittedDomains();
        if (!permittedDomains || permittedDomains.length === 0) {
            return false;
        }

        permittedDomains.forEach((domain) => {
            const hash = fastHash(domain);

            // Add the rule to the lookup table
            let rulesIndexes = this.domainsLookupTable.get(hash);
            if (!rulesIndexes) {
                rulesIndexes = [];
            }
            rulesIndexes.push(storageIdx);
            this.domainsLookupTable.set(hash, rulesIndexes);
        });

        return true;
    }

    /**
     * Splits the specified hostname and returns all subdomains (including the hostname itself)
     *
     * @param hostname
     * @return array of subdomains
     */
    private static getSubdomains(hostname: string): string[] {
        const parts = hostname.split('.');
        const subdomains = [];
        let domain = '';

        for (let i = parts.length - 1; i >= 0; i -= 1) {
            if (domain === '') {
                domain = parts[i];
            } else {
                domain = `${parts[i]}.${domain}`;
            }

            subdomains.push(domain);
        }

        return subdomains;
    }
}
