import { nodesToMarkdownFiles } from "./obsidian-export";
import type { KnowledgeNode } from "./messaging";
import { getSettings, saveSettings } from "./storage";

type VaultPermissionDescriptor = { mode: "readwrite" | "read" };

interface VaultDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(descriptor: VaultPermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor: VaultPermissionDescriptor): Promise<PermissionState>;
}

interface VaultWindow extends Window {
  showDirectoryPicker(options?: {
    mode?: "read" | "readwrite";
  }): Promise<FileSystemDirectoryHandle>;
}

const IDB_NAME = "cek-vault";
const IDB_STORE = "handles";
const HANDLE_KEY = "cek-vault-handle";

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeVaultHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getStoredVaultHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const request = tx.objectStore(IDB_STORE).get(HANDLE_KEY);
    request.onsuccess = () => {
      resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

async function ensureVaultPermission(
  handle: FileSystemDirectoryHandle,
  requestIfNeeded: boolean
): Promise<boolean> {
  const vaultHandle = handle as VaultDirectoryHandle;
  const opts: VaultPermissionDescriptor = { mode: "readwrite" };
  if ((await vaultHandle.queryPermission(opts)) === "granted") {
    return true;
  }
  if (!requestIfNeeded) return false;
  return (await vaultHandle.requestPermission(opts)) === "granted";
}

async function resolveSubfolder(
  root: FileSystemDirectoryHandle,
  subfolder: string
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of subfolder.split("/").filter(Boolean)) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

async function writeMarkdownFile(
  dir: FileSystemDirectoryHandle,
  filename: string,
  content: string
): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function isVaultConnected(): Promise<boolean> {
  const handle = await getStoredVaultHandle();
  if (!handle) return false;
  return ensureVaultPermission(handle, false);
}

export async function connectVault(): Promise<boolean> {
  if (typeof window === "undefined" || !("showDirectoryPicker" in window)) {
    throw new Error("File System Access API is not available in this context");
  }

  const handle = await (window as VaultWindow).showDirectoryPicker({
    mode: "readwrite",
  });
  const granted = await ensureVaultPermission(handle, true);
  if (!granted) return false;

  await storeVaultHandle(handle);
  const settings = await getSettings();
  await saveSettings({
    ...settings,
    obsidian: { ...settings.obsidian, vaultConnected: true },
  });
  return true;
}

export async function syncNodesToVault(
  nodes: KnowledgeNode[],
  subfolder: string
): Promise<{ written: number; errors: string[] }> {
  const errors: string[] = [];
  const handle = await getStoredVaultHandle();
  if (!handle) {
    return { written: 0, errors: ["No vault folder connected"] };
  }

  const granted = await ensureVaultPermission(handle, true);
  if (!granted) {
    const settings = await getSettings();
    if (settings.obsidian.vaultConnected) {
      await saveSettings({
        ...settings,
        obsidian: { ...settings.obsidian, vaultConnected: false },
      });
    }
    return { written: 0, errors: ["Vault folder permission denied"] };
  }

  let written = 0;
  try {
    const dir = await resolveSubfolder(handle, subfolder || "cek");
    const files = nodesToMarkdownFiles(nodes);
    for (const [filename, content] of files) {
      try {
        await writeMarkdownFile(dir, filename, content);
        written += 1;
      } catch (e) {
        errors.push(`${filename}: ${String(e)}`);
      }
    }
  } catch (e) {
    errors.push(String(e));
  }

  return { written, errors };
}

export async function triggerObsidianAutoSync(
  nodes: KnowledgeNode[]
): Promise<void> {
  const settings = await getSettings();
  if (!settings.obsidian.autoSync || !settings.obsidian.vaultConnected) {
    return;
  }
  if (!(await isVaultConnected())) return;
  await syncNodesToVault(nodes, settings.obsidian.subfolder);
}
