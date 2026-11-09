import type { Manifest } from "./types";

/**
 * Every Tool and Category in the Toolbox. Adding an entry here makes it appear
 * in the app; no UI code changes.
 */
export const manifest: Manifest = {
  categories: [
    {
      id: "disk-cleanup",
      name: "Disk cleanup",
      tools: [
        {
          id: "free-space-check",
          name: "Free-space check",
          description: "Shows used and free space on C:. Changes nothing.",
          risk: "read-only",
          steps: [
            {
              kind: "command",
              command:
                "Get-PSDrive C | Select-Object @{n='UsedGB';e={[math]::Round($_.Used/1GB,1)}}, @{n='FreeGB';e={[math]::Round($_.Free/1GB,1)}} | Format-Table -AutoSize | Out-String",
            },
          ],
        },
      ],
    },
  ],
};
