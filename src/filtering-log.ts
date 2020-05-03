import { CosmeticRule } from './rules/cosmetic-rule';
import { NetworkRule } from './rules/network-rule';

/**
 * Filtering log interface
 */
export interface FilteringLog {
    /**
     * Add html rule event to log
     *
     * @param {Number} tabId - tab id
     * @param {String} elementString - element string presentation
     * @param {String} frameUrl - Frame url
     * @param {CosmeticRule} rule - rule
     */
    addHtmlEvent(tabId: number, elementString: string, frameUrl: string, rule: CosmeticRule): void;

    /**
     * Add html rule event to log
     *
     * @param {Number} tabId - tab id
     * @param {String} frameUrl - Frame url
     * @param {NetworkRule[]} rules - cookie rule
     */
    addReplaceRulesEvent(tabId: number, frameUrl: string, rules: NetworkRule[]): void;

    /**
     * Adds cookie rule event
     *
     * @param tabId
     * @param cookieName
     * @param rules
     */
    addCookieEvent(tabId: number, cookieName: string, rules: NetworkRule[]): void;
}
