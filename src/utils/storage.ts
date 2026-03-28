const DB_NAME = 'PaperEaseDB';
const DB_VERSION = 2;
const FILES_STORE = 'files';
const PORTRAIT_STORE = 'portraits';
const TRANSLATION_STORE = 'translationProgress';

interface StoredFile {
  id: string;
  fileName: string;
  fileData: ArrayBuffer;
  doi: string | null;
  metadata: any;
  portrait: string | null;
  currentPage: number;
  totalPages: number;
  timestamp: number;
}

interface StoredPortrait {
  doi: string;
  portrait: string;
  timestamp: number;
}

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(PORTRAIT_STORE)) {
        db.createObjectStore(PORTRAIT_STORE, { keyPath: 'doi' });
      }

      if (!db.objectStoreNames.contains(TRANSLATION_STORE)) {
        db.createObjectStore(TRANSLATION_STORE, { keyPath: 'id' });
      }
    };
  });
}

export async function saveFile(
  fileData: ArrayBuffer,
  fileName: string,
  doi: string | null = null,
  metadata: any = null,
  currentPage: number = 1,
  totalPages: number = 0
): Promise<void> {
  const db = await openDB();
  const id = 'current-file';

  const storedFile: StoredFile = {
    id,
    fileName,
    fileData,
    doi,
    metadata,
    portrait: null,
    currentPage,
    totalPages,
    timestamp: Date.now()
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILES_STORE], 'readwrite');
    const store = transaction.objectStore(FILES_STORE);
    const request = store.put(storedFile);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getFile(): Promise<StoredFile | null> {
  const db = await openDB();
  const id = 'current-file';

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILES_STORE], 'readonly');
    const store = transaction.objectStore(FILES_STORE);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

export async function updateCurrentPage(page: number): Promise<void> {
  const file = await getFile();
  if (file) {
    const db = await openDB();
    file.currentPage = page;
    file.timestamp = Date.now();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([FILES_STORE], 'readwrite');
      const store = transaction.objectStore(FILES_STORE);
      const request = store.put(file);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

export async function savePortrait(doi: string, portrait: string): Promise<void> {
  const db = await openDB();

  const storedPortrait: StoredPortrait = {
    doi,
    portrait,
    timestamp: Date.now()
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PORTRAIT_STORE], 'readwrite');
    const store = transaction.objectStore(PORTRAIT_STORE);
    const request = store.put(storedPortrait);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getPortrait(doi: string): Promise<string | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PORTRAIT_STORE], 'readonly');
    const store = transaction.objectStore(PORTRAIT_STORE);
    const request = store.get(doi);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result as StoredPortrait | undefined;
      resolve(result?.portrait || null);
    };
  });
}

export async function updateFileMetadata(
  doi: string | null,
  metadata: any,
  portrait: string | null = null
): Promise<void> {
  const file = await getFile();
  if (file) {
    const db = await openDB();
    file.doi = doi;
    file.metadata = metadata;
    if (portrait) {
      file.portrait = portrait;
    }
    file.timestamp = Date.now();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([FILES_STORE], 'readwrite');
      const store = transaction.objectStore(FILES_STORE);
      const request = store.put(file);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

export async function clearAllData(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILES_STORE, PORTRAIT_STORE], 'readwrite');
    const filesStore = transaction.objectStore(FILES_STORE);
    const portraitsStore = transaction.objectStore(PORTRAIT_STORE);

    const clearFiles = filesStore.clear();
    const clearPortraits = portraitsStore.clear();

    let filesCleared = false;
    let portraitsCleared = false;

    const checkComplete = () => {
      if (filesCleared && portraitsCleared) {
        resolve();
      }
    };

    clearFiles.onsuccess = () => {
      filesCleared = true;
      checkComplete();
    };

    clearPortraits.onsuccess = () => {
      portraitsCleared = true;
      checkComplete();
    };

    clearFiles.onerror = () => reject(clearFiles.error);
    clearPortraits.onerror = () => reject(clearPortraits.error);
  });
}

export async function getStorageSize(): Promise<number> {
  const file = await getFile();
  if (file) {
    return file.fileData.byteLength;
  }
  return 0;
}

export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

interface TranslationProgress {
  id: string;
  pages: any[];
  isCompleted: boolean;
  timestamp: number;
}

export async function saveTranslationProgress(progress: {
  pages: any[];
  isCompleted: boolean;
}): Promise<void> {
  const db = await openDB();
  const id = 'current-translation';

  const storedProgress: TranslationProgress = {
    id,
    pages: progress.pages,
    isCompleted: progress.isCompleted,
    timestamp: Date.now()
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TRANSLATION_STORE], 'readwrite');
    const store = transaction.objectStore(TRANSLATION_STORE);
    const request = store.put(storedProgress);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getTranslationProgress(): Promise<{
  pages: any[];
  isCompleted: boolean;
} | null> {
  const db = await openDB();
  const id = 'current-translation';

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TRANSLATION_STORE], 'readonly');
    const store = transaction.objectStore(TRANSLATION_STORE);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result as TranslationProgress | undefined;
      if (result) {
        resolve({
          pages: result.pages,
          isCompleted: result.isCompleted
        });
      } else {
        resolve(null);
      }
    };
  });
}

export async function clearTranslationProgress(): Promise<void> {
  const db = await openDB();
  const id = 'current-translation';

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TRANSLATION_STORE], 'readwrite');
    const store = transaction.objectStore(TRANSLATION_STORE);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
