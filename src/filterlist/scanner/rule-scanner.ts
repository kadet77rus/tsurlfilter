import { IndexedRule, IRule } from '../../rule';
import { RuleBuilder } from '../../rule-builder';
import { ILineReader } from '../reader/line-reader';

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

    /**
     * Reader object
     */
    private readonly reader: ILineReader;

    /**
     *  Current rule
     */
    private currentRule: IRule | null = null;

    /**
     * Index of the beginning of the current rule
     */
    private currentRuleIndex = 0;

    /**
     * Current position in the reader
     */
    private currentPos = 0;

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
            const lineIndex = this.currentPos;
            const line = this.readNextLine();
            if (line === null) {
                return false;
            }

            if (line) {
                const rule = RuleBuilder.createRule(line, this.listId);
                if (rule && !this.isIgnored(rule)) {
                    this.currentRule = rule;
                    this.currentRuleIndex = lineIndex;
                    return true;
                }
            }
        }
    }

    /**
     * @return the most recent rule generated by a call to Scan, and the index of this rule's text.
     */
    public getRule(): IndexedRule | null{
        if (this.currentRule) {
            return new IndexedRule(this.currentRule, this.currentRuleIndex);
        }

        return null;
    }

    /**
     * Reads the next line and returns it
     *
     * @return next line string or null
     */
    private readNextLine(): string | null {
        while (true) {
            const line = this.reader.readLine();

            if (line) {
                // TODO: Read bytes in readLine
                this.currentPos += Buffer.from(line).length;
                return line.trim();
            }

            return line;
        }
    }

    /**
     * Checks if the rule should be ignored by this scanner
     *
     * @param rule to check
     * @return is rule ignored
     */
    private isIgnored(rule: IRule): boolean {
        if (!this.ignoreCosmetic) {
            return false;
        }

        return rule.isCosmetic();
    }
}