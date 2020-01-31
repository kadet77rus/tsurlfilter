import { FileLineReader } from '../../src/filterlist/file-line-reader';

describe('FileLineReader Test', () => {
    it('works if reader gets lines', () => {
        let line;
        let reader;

        try {
            reader = new FileLineReader('');
            expect(reader).toBeFalsy();
        } catch (e) {
            expect(e).toBeTruthy();
        }

        try {
            reader = new FileLineReader('incorrect path');
            expect(reader).toBeFalsy();
        } catch (e) {
            expect(e).toBeTruthy();
        }

        reader = new FileLineReader('./test/resources/hosts');
        expect(reader).toBeTruthy();
        line = reader.readLine();
        expect(line).toBe('# This hosts file is a merged collection of hosts from reputable sources,\n');
        line = reader.readLine();
        expect(line).toBe('# with a dash of crowd sourcing via Github\n');
    });
});
