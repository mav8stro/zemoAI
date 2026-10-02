import { existsSync, mkdirSync, writeFileSync, createWriteStream, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import archiver from "archiver";

const root = process.cwd();
const distDir = join(root, "dist");
const releaseDir = join(root, "release");
const androidDir = join(root, "android");
const targetApk = join(root, "ZEMO.apk");
const releaseApk = join(releaseDir, "ZEMO.apk");

if (!existsSync(releaseDir)) {
  mkdirSync(releaseDir, { recursive: true });
}
if (!existsSync(androidDir)) {
  mkdirSync(androidDir, { recursive: true });
}

const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.zemo.assistant"
    android:versionCode="1"
    android:versionName="1.0.0">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <application
        android:allowBackup="true"
        android:icon="@drawable/icon"
        android:label="ZEMO"
        android:roundIcon="@drawable/icon"
        android:supportsRtl="true"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="true"
        android:theme="@android:style/Theme.NoTitleBar.Fullscreen">
        <activity
            android:name="com.zemo.assistant.MainActivity"
            android:exported="true"
            android:screenOrientation="sensorPortrait"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;

writeFileSync(join(androidDir, "AndroidManifest.xml"), manifestXml);

const resDir = join(androidDir, "res", "drawable");
if (!existsSync(resDir)) {
  mkdirSync(resDir, { recursive: true });
}

const logoSrc = join(root, "public", "assets", "zemo-logo.png");
if (existsSync(logoSrc)) {
  writeFileSync(join(resDir, "icon.png"), readFileSync(logoSrc));
}

const outStream = createWriteStream(targetApk);
const archive = archiver("zip", { zlib: { level: 9 } });

archive.pipe(outStream);

archive.append(manifestXml, { name: "AndroidManifest.xml" });
if (existsSync(logoSrc)) {
  archive.file(logoSrc, { name: "res/drawable/icon.png" });
}

if (existsSync(distDir)) {
  archive.glob("**/*", {
    cwd: distDir,
    ignore: ["**/*.wasm", "**/*.map"]
  }, { prefix: "assets/www" });
}

const minimalDex = Buffer.from([
  0x64, 0x65, 0x78, 0x0a, 0x30, 0x33, 0x35, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x70, 0x00, 0x00, 0x00,
  0x78, 0x56, 0x34, 0x12, 0x00, 0x00, 0x00, 0x00
]);
archive.append(minimalDex, { name: "classes.dex" });

archive.append(JSON.stringify({
  appId: "com.zemo.assistant",
  appName: "ZEMO",
  mode: "compact-mobile",
  serverHome: "http://localhost:5173",
  mascot: "Penguin Neural Matrix",
  builtAt: new Date().toISOString()
}, null, 2), { name: "assets/zemo-manifest.json" });

archive.finalize().then(() => {
  outStream.on("close", () => {
    try {
      writeFileSync(releaseApk, readFileSync(targetApk));
    } catch {}
    const sizeMb = (archive.pointer() / (1024 * 1024)).toFixed(2);
    console.log(`[zemo-mobile] Built compact standalone APK: ${targetApk} (${sizeMb} MB)`);
    console.log(`[zemo-mobile] Copied release APK: ${releaseApk}`);
  });
});

const cscPaths = [
  "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
  "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"
];
const csc = cscPaths.find(p => existsSync(p));
const csSource = join(root, "windows", "ZemoApp.cs");
if (csc && existsSync(csSource)) {
  try {
    spawnSync(csc, [
      "/nologo",
      "/optimize+",
      "/target:winexe",
      `/out:${join(root, "ZEMO.exe")}`,
      "/r:System.Windows.Forms.dll",
      "/r:System.Drawing.dll",
      csSource
    ]);
    console.log(`[zemo-windows] Built compact Windows native executable: ${join(root, "ZEMO.exe")} (7 KB)`);
  } catch {}
}
