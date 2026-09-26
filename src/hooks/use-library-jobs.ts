import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type { ImportJob } from '@/components/import-cards';
import { toast } from '@/components/toast';
import { isImporting, lastImport } from '@/scan/import';
import { importSummary } from '@/scan/import-plan';
import { runningScan, scanLibrary } from '@/scan/scanner';
import { libraryEvents, type ImportProgress, type ScanProgress } from '@/utils/events';

/**
 * The import and the scan, as a screen that starts them shows them: the latest progress of each
 * (still there when the screen was left and opened again), whether either is running, and the
 * two ways to start one.
 */
export function useLibraryJobs() {
  const db = useSQLiteContext();
  const [progress, setProgress] = useState<ScanProgress | null>(runningScan);
  const [imported, setImported] = useState<ImportProgress | null>(lastImport);
  const scanning = progress != null && progress.phase !== 'done' && progress.phase !== 'error';
  const importing = isImporting(imported);

  useEffect(() => libraryEvents.on('scanProgress', setProgress), []);
  useEffect(() => libraryEvents.on('importProgress', setImported), []);

  // The toast comes up even when the screen was left while the import ran.
  const runImport = async (job: ImportJob) => {
    try {
      const result = await job(db);
      if (result) toast.show(importSummary(result));
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err));
    }
  };

  return {
    progress,
    imported,
    scanning,
    busy: scanning || importing,
    runImport: (job: ImportJob) => void runImport(job),
    scan: () => void scanLibrary(db),
  };
}
