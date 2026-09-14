import { Capacitor } from "@capacitor/core";
import { isTauri, invoke } from "@tauri-apps/api/core";
export async function exportText(
  name: string,
  content: string,
  mime = "application/json",
) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } =
      await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const file = await Filesystem.writeFile({
      path: name,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: name,
      url: file.uri,
      dialogTitle: "保存或分享备份",
    });
  } else if (isTauri()) await invoke("export_text", { name, content });
  else {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
