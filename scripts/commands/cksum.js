(() => {
    "use strict";

    const cksumCommandDefinition = {
        commandName: "cksum",
        flagDefinitions: [],
        coreLogic: async (context) => {
            const { args, input } = context;

            if (input === null) {
                return { success: false, error: "cksum: No readable input provided." };
            }

            const crc32 = (str) => {
                const table = [];
                for (let i = 0; i < 256; i++) {
                    let c = i;
                    for (let j = 0; j < 8; j++) {
                        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                    }
                    table[i] = c;
                }
                let crc = -1;
                for (let i = 0; i < str.length; i++) {
                    crc = (crc >>> 8) ^ table[(crc ^ str.charCodeAt(i)) & 0xFF];
                }
                return (crc ^ -1) >>> 0;
            };

            const checksum = crc32(input);
            const byteCount = input.length;
            const fileName = args.length > 0 ? ` ${args[0]}`: '';

            return {
                success: true,
                output: `${checksum} ${byteCount}${fileName}`
            };
        }
    };

    const cksumDescription = "Print checksum and byte counts of files.";
    const cksumHelpText = `Usage: cksum [FILE]...

Calculate and print a checksum, byte count, and filename for each FILE.

DESCRIPTION
       The cksum utility calculates and writes to standard output a 32-bit
       checksum (CRC), the total number of bytes, and the name for each
       input file.
       
       It is typically used to quickly compare a suspect file against a trusted
       version to ensure that the file has not been accidentally corrupted.

       If no file is specified, or if the file is '-', cksum reads from
       standard input, and no filename is printed.

EXAMPLES
       cksum my_script.sh
              Displays the checksum and size of the script file.

       cat my_script.sh | cksum
              Calculates the checksum and size from the piped content.`;

    CommandRegistry.register("cksum", cksumCommandDefinition, cksumDescription, cksumHelpText);
})();