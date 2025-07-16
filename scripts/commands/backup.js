// scripts/commands/backup.js
import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';

(() => {
  "use strict";

  const backupCommandDefinition = {
    commandName: "backup",
    argValidation: {
      exact: 0,
    },
    coreLogic: async (context) => {
      const { options } = context;

      try {
        if (!options.isInteractive) {
          return { success: false, error: "backup: Can only be run in interactive mode." };
        }

        const currentUser = UserManager.getCurrentUser();
        // ... (rest of the data gathering logic from the original file remains the same)
        const allKeys = StorageManager.getAllLocalStorageKeys();
        const automaticSessionStates = {};
        const manualSaveStates = {};

        allKeys.forEach((key) => {
          if (key.startsWith(Config.STORAGE_KEYS.USER_TERMINAL_STATE_PREFIX)) {
            automaticSessionStates[key] = StorageManager.loadItem(key);
          } else if (key.startsWith(Config.STORAGE_KEYS.MANUAL_TERMINAL_STATE_PREFIX)) {
            manualSaveStates[key] = StorageManager.loadItem(key);
          }
        });

        const backupData = {
          dataType: "OopisOS_System_State_Backup_v3.2",
          osVersion: Config.OS.VERSION,
          timestamp: new Date().toISOString(),
          fsDataSnapshot: Utils.deepCopyNode(FileSystemManager.getFsData()),
          userCredentials: StorageManager.loadItem(Config.STORAGE_KEYS.USER_CREDENTIALS, "User Credentials", {}),
          editorWordWrapEnabled: StorageManager.loadItem(Config.STORAGE_KEYS.EDITOR_WORD_WRAP_ENABLED, "Editor Word Wrap", false),
          automaticSessionStates,
          manualSaveStates,
        };

        const stringifiedDataForChecksum = JSON.stringify(backupData);
        const checksum = await Utils.calculateSHA256(stringifiedDataForChecksum);

        if (!checksum) {
          return { success: false, error: "backup: Failed to compute integrity checksum." };
        }
        backupData.checksum = checksum;

        const backupJsonString = JSON.stringify(backupData, null, 2);
        const defaultFileName = `OopisOS_System_Backup_${currentUser.name}_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

        // --- Environment-Specific Logic ---
        if (window.__TAURI__) {
          // Tauri Environment: Use native file save dialog
          const { save } = await import('@tauri-apps/api/dialog');
          const { writeTextFile } = await import('@tauri-apps/api/fs');

          const filePath = await save({
            title: 'Save OopisOS Backup',
            defaultPath: defaultFileName,
            filters: [{ name: 'OopisOS Backup', extensions: ['json'] }]
          });

          if (filePath) {
            await writeTextFile(filePath, backupJsonString);
            return { success: true, output: `Backup saved successfully to ${filePath}.` };
          } else {
            return { success: true, output: "Backup cancelled." };
          }
        } else {
          // Web Browser Environment: Use blob to trigger download
          const blob = new Blob([backupJsonString], { type: "application/json;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = Utils.createElement("a", {
            href: url,
            download: defaultFileName,
          });
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          return { success: true, output: `Backup file '${defaultFileName}' is being downloaded.` };
        }

      } catch (e) {
        return { success: false, error: `backup: An unexpected error occurred: ${e.message}` };
      }
    },
  };

  const backupDescription = "Creates a secure backup of the current OopisOS system state.";
  const backupHelpText = `Usage: backup\n\nCreates a secure, verifiable backup of the current OopisOS system state.`;
  CommandRegistry.register("backup", backupCommandDefinition, backupDescription, backupHelpText);
})();