import { Request } from '../request';
import { FilteringLog } from '../filtering-log';
import { NetworkRule } from '../rules/network-rule';
import CookieUtils from './utils';
import { CookieModifier } from '../modifiers/cookie-modifier';
import { BrowserCookie } from './browser-cookie';

/**
 * Header interface
 */
interface Header {
    name: string;
    value: string;
}

/**
 * Cookie manager interface
 * TODO: Extract file
 */
export interface CookieApi {
    /**
     * Removes cookie
     *
     * @param name
     * @param url
     */
    removeCookie(name: string, url: string): void;

    /**
     * Modifies cookie
     *
     * @param setCookie
     * @param url
     */
    modifyCookie(setCookie: BrowserCookie, url: string): void;

    /**
     * Fetch cookies
     *
     * @param name
     * @param url
     */
    getCookies(name: string, url: string): BrowserCookie[];
}

/**
 * Cookie filtering module
 * https://github.com/AdguardTeam/AdguardBrowserExtension/issues/961
 *
 * Modifies Cookie/Set-Cookie headers.
 *
 * Let's look at an example:
 *
 * 1. ||example.org^$cookie=i_track_u should block the i_track_u cookie coming from example.org
 * 2. We've intercepted a request sent to https://example.org/count
 * 3. Cookie header value is i_track_u=1; JSESSIONID=321321
 * 4. First of all, modify the Cookie header so that the server doesn't receive the i_track_u value.
 *    Modified value: JSESSIONID=321321
 * 5. Wait for the response and check all the Set-Cookie headers received from the server.
 * 6. Remove the one that sets the i_track_u cookie (or modify it and strip that cookie if it contains more than one)
 * 7. Now we need to make sure that browser deletes that cookie.
 *    In order to do it, we should add a new Set-Cookie header that sets i_track_u with a negative
 *    expiration date: Set-Cookie: i_track_u=1; expires=[CURRENT_DATETIME]; path=/; domain=.example.org.
 *
 * Step 7 must not be executed when the rule has the third-party modifier.
 * third-party means that there is a case (first-party) when cookies must not be removed, i.e.
 * they can be actually useful, and removing them can be counterproductive.
 * For instance, Google and Facebook rely on their SSO cookies and forcing a browser to remove
 * them will also automatically log you out.
 */
export class CookieFiltering {
    /**
     * Contains cookie to modify for each request
     */
    // eslint-disable-next-line max-len
    private cookiesMap: Map<number, { remove: boolean;cookie: { name: string; url: string };rules: NetworkRule[]}[]> = new Map();

    /**
     * Cookie api implementation
     */
    private cookieManager: CookieApi;

    /**
     * Filtering log
     */
    private filteringLog: FilteringLog;

    constructor(cookieManager: CookieApi, filteringLog: FilteringLog) {
        this.cookieManager = cookieManager;
        this.filteringLog = filteringLog;
    }

    /**
     * Modifies request headers according to matching $cookie rules.
     * TODO: Handle stealth cookie rules
     *
     * @param request
     * @param requestHeaders Request headers
     * @return True if headers were modified
     */
    public processRequestHeaders(request: Request, requestHeaders: Header[], cookieRules: NetworkRule[]): boolean {
        if ((cookieRules.length === 0)) {
            // Nothing to apply
            return false;
        }

        const {
            requestId, url,
        } = request;

        const cookieHeader = CookieFiltering.findHeaderByName(requestHeaders, 'Cookie');
        if (!cookieHeader) {
            return false;
        }

        const cookies = CookieUtils.parseCookie(cookieHeader.value);
        if (cookies.length === 0) {
            return false;
        }

        let cookieHeaderModified = false;

        let iCookies = cookies.length;
        // modifying cookies here is safe because we're iterating in reverse order
        // eslint-disable-next-line no-cond-assign
        while (iCookies > 0) {
            iCookies -= 1;
            const cookie = cookies[iCookies];

            const cookieName = cookie.name;

            const bRule = CookieFiltering.lookupNotModifyingRule(cookieName, cookieRules);
            if (bRule) {
                if (!bRule.isWhitelist()) {
                    cookies.splice(iCookies, 1);
                    cookieHeaderModified = true;
                }
                this.scheduleProcessingCookie(requestId!, cookieName, url, [bRule], true);
            }

            const mRules = CookieFiltering.lookupModifyingRules(cookieName, cookieRules);
            if (mRules && mRules.length > 0) {
                this.scheduleProcessingCookie(requestId!, cookieName, url, mRules, false);
            }
        }

        if (cookieHeaderModified) {
            cookieHeader.value = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        }

        return cookieHeaderModified;
    }

    /**
     * Modifies cookies with browser.api
     * TODO: Add filtering log events
     *
     * @param requestId Request identifier
     */
    public async modifyCookies(requestId: number): Promise<void> {
        const values = this.cookiesMap.get(requestId);
        if (!values || values.length === 0) {
            return;
        }

        for (const value of values) {
            const cookie = value.cookie || {};

            if (value.remove) {
                this.cookieManager.removeCookie(cookie.name, cookie.url);
            } else {
                this.modifyCookie(cookie.name, cookie.url, value.rules);
            }
        }

        this.cookiesMap.delete(requestId);
    }

    /**
     * Modifies cookie with rules
     *
     * @param name
     * @param url
     * @param rules
     */
    private modifyCookie(name: string, url: string, rules: NetworkRule[]): void {
        const cookies = this.cookieManager.getCookies(name, url);
        for (let i = 0; i < cookies.length; i += 1) {
            const cookie = cookies[i];
            if (cookie) {
                const mRules = CookieFiltering.applyRuleToBrowserCookie(cookie, rules);
                if (mRules && mRules.length > 0) {
                    this.cookieManager.modifyCookie(cookie, url);
                }
            }
        }
    }

    /**
     * Persist cookie for further processing
     *
     * @param {string} requestId
     * @param {string} name
     * @param {string} url
     * @param rules
     * @param {boolean} remove
     */
    private scheduleProcessingCookie(
        requestId: number,
        name: string,
        url: string,
        rules: NetworkRule[],
        remove: boolean,
    ): void {
        let values = this.cookiesMap.get(requestId);
        if (!values) {
            values = [];
            this.cookiesMap.set(requestId, values);
        }

        values.push({
            remove,
            cookie: { name, url },
            rules,
        });
    }

    /**
     * Modifies set-cookie header with rules
     *
     * @param cookie Cookie header to modify
     * @param rules Cookie matching rules
     * @return applied rules
     *
     */
    private static applyRuleToBrowserCookie(cookie: BrowserCookie, rules: NetworkRule[]): NetworkRule[] {
        const appliedRules = [];

        for (let i = 0; i < rules.length; i += 1) {
            const rule = rules[i];
            const cookieModifier = rule.getAdvancedModifier() as CookieModifier;

            let modified = false;

            // eslint-disable-next-line prefer-destructuring
            const sameSite = cookieModifier.getSameSite();
            if (sameSite && cookie.sameSite !== sameSite) {
                // eslint-disable-next-line no-param-reassign
                cookie.sameSite = sameSite;
                modified = true;
            }

            const maxAge = cookieModifier.getMaxAge();
            if (maxAge) {
                if (CookieFiltering.updateSetCookieMaxAge(cookie, maxAge)) {
                    modified = true;
                }
            }

            if (modified) {
                appliedRules.push(rule);
            }
        }

        return appliedRules;
    }

    /**
     * Updates set-cookie maxAge value
     * TODO: Move to utils
     *
     * @param setCookie Cookie to modify
     * @param maxAge
     * @return if cookie was modified
     */
    private static updateSetCookieMaxAge(setCookie: BrowserCookie, maxAge: number): boolean {
        const currentTimeSec = Date.now() / 1000;

        let cookieExpiresTimeSec = null;
        if (setCookie.maxAge) {
            cookieExpiresTimeSec = currentTimeSec + setCookie.maxAge;
        } else if (setCookie.expires) {
            cookieExpiresTimeSec = setCookie.expires.getTime() / 1000;
        }

        const newCookieExpiresTimeSec = currentTimeSec + maxAge;
        if (cookieExpiresTimeSec === null || cookieExpiresTimeSec > newCookieExpiresTimeSec) {
            if (setCookie.expires) {
                // eslint-disable-next-line no-param-reassign
                setCookie.expires = new Date(newCookieExpiresTimeSec * 1000);
            } else {
                // eslint-disable-next-line no-param-reassign
                setCookie.maxAge = maxAge;
            }

            return true;
        }

        return false;
    }

    /**
     * Checks if $cookie rule is modifying
     *
     * @param rule $cookie rule
     * @return result
     */
    private static isModifyingRule(rule: NetworkRule): boolean {
        const cookieModifier = rule.getAdvancedModifier() as CookieModifier;
        return cookieModifier.getSameSite() !== null
            || (cookieModifier.getMaxAge() !== null && cookieModifier.getMaxAge()! > 0);
    }

    /**
     * Finds a rule that doesn't modify cookie: i.e. this rule cancels cookie or it's a whitelist rule.
     *
     * @param cookieName Cookie name
     * @param rules Matching rules
     * @return Found rule or null
     */
    private static lookupNotModifyingRule(cookieName: string, rules: NetworkRule[]): NetworkRule | null {
        if (rules && rules.length > 0) {
            for (let i = 0; i < rules.length; i += 1) {
                const rule = rules[i];
                const cookieModifier = rule.getAdvancedModifier() as CookieModifier;
                if (cookieModifier.matches(cookieName) && !CookieFiltering.isModifyingRule(rule)) {
                    return rule;
                }
            }
        }

        return null;
    }

    /**
     * Finds rules that modify cookie
     *
     * @param cookieName Cookie name
     * @param rules Matching rules
     * @return Modifying rules
     */
    private static lookupModifyingRules(cookieName: string, rules: NetworkRule[]): NetworkRule[] {
        const result = [];
        if (rules && rules.length > 0) {
            for (let i = 0; i < rules.length; i += 1) {
                const rule = rules[i];
                const cookieModifier = rule.getAdvancedModifier() as CookieModifier;
                if (!cookieModifier.matches(cookieName)) {
                    continue;
                }
                // Blocking or whitelist rule exists
                if (!CookieFiltering.isModifyingRule(rule)) {
                    return [];
                }

                result.push(rule);
            }
        }
        return result;
    }

    /**
     * Finds header object by header name (case insensitive)
     *
     * @param headers Headers collection
     * @param headerName Header name
     * @returns header
     */
    private static findHeaderByName(headers: Header[], headerName: string): Header | null {
        if (headers) {
            for (let i = 0; i < headers.length; i += 1) {
                const header = headers[i];
                if (header.name.toLowerCase() === headerName.toLowerCase()) {
                    return header;
                }
            }
        }

        return null;
    }
}