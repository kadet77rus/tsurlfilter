// eslint-disable-next-line max-classes-per-file
import fs from 'fs';
import { IRule } from '../rule';
import { NetworkRule } from '../network-rule';

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/interface-name-prefix
export interface ILineReader {
    /**
     * Reads the next line
     *
     * @return line string or null
     */
    readLine(): string| null;
}

export class StringLineReader implements ILineReader {
    private readonly text: string;

    constructor(text: string) {
        this.text = text;
    }

    public readLine(): string | null {
        // TODO: Implement properly
        // return this.text.split('\n')[0];
        return null;
    }
}

export class FileLineReader implements ILineReader {
    private readonly text: string;

    constructor(path: string) {
        this.text = fs.readFileSync(path, 'utf8');
    }

    public readLine(): string | null {
        // TODO: Implement properly
        // return this.text.split('\n')[0];
        return null;
    }
}

/**
 * Rule scanner implements an interface for reading filtering rules.
 */
export class RuleScanner {
    /**
     * Filter list ID
     */
    private readonly listId: number;

    /**
     * True if we should ignore cosmetic rules
     */
    private readonly ignoreCosmetic: boolean;

    private readonly reader: ILineReader;

    /**
     *  Current rule
     */
    private currentRule: IRule | null = null;

    /**
     * NewRuleScanner returns a new RuleScanner to read from r.
     *
     * @param reader source of the filtering rules
     * @param listId filter list ID
     * @param ignoreCosmetic if true, cosmetic rules will be ignored
     */
    constructor(reader: ILineReader, listId: number, ignoreCosmetic: boolean) {
        this.reader = reader;
        this.listId = listId;
        this.ignoreCosmetic = ignoreCosmetic;
    }

    /**
     * Scan advances the RuleScanner to the next rule, which will then be available
     * through the Rule method.
     *
     * @return false when the scan stops, either by
     * reaching the end of the input or an error.
    */
    public scan(): boolean {
        while (true) {
            const line = this.readNextLine();
            if (!line) {
                return false;
            }

            // TODO: Implement rule builder
            // const rule = new Rule(line, this.listId);
            const rule = new NetworkRule(line, this.listId);
            if (rule && !this.isIgnored(rule)) {
                this.currentRule = rule;
                return true;
            }
        }
    }

    /**
     * @return the most recent rule generated by a call to Scan, and the index of this rule's text.
     */
    public getRule(): IRule | null{
        return this.currentRule;
    }

    /**
     * reads the next line and returns it and the index of the beginning of the string
     */
    private readNextLine(): string | null {
        return this.reader.readLine();
    }

    // isIgnored checks if the rule should be ignored by this scanner
    private isIgnored(rule: IRule): boolean {
        if (!this.ignoreCosmetic) {
            return false;
        }

        // TODO: Implement rule.isCosmetic()
        // return !!rule.isCosmetic();
        return false;
    }
}
