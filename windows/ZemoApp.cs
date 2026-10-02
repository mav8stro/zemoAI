using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace Zemo
{
    static class Program
    {
        private static Mutex appMutex = null;

        [STAThread]
        static void Main()
        {
            // Ensure single-instance
            bool createdNew;
            appMutex = new Mutex(true, "ZEMO_HOLOGRAPHIC_AI_MUTEX", out createdNew);
            if (!createdNew)
            {
                MessageBox.Show("Z.E.M.O. is already running.", "Z.E.M.O.", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".zemo", "zemo-app.log");
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(logPath));
                File.AppendAllText(logPath, string.Format("[{0}] ZEMO.exe started\n", DateTime.Now.ToString("s")));
            }
            catch { }

            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string launcherScript = Path.Combine(baseDir, "zemo", "windows", "launcher.mjs");
                if (!File.Exists(launcherScript))
                {
                    // Check if run directly from inside zemo folder
                    launcherScript = Path.Combine(baseDir, "windows", "launcher.mjs");
                }

                if (!File.Exists(launcherScript))
                {
                    string err = "Cannot locate launcher script at:\n" + launcherScript;
                    try { File.AppendAllText(logPath, "[Error] " + err + "\n"); } catch { }
                    MessageBox.Show(err, "Z.E.M.O. Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                string nodeExe = FindNodeExecutable();
                if (string.IsNullOrEmpty(nodeExe))
                {
                    string err = "Node.js runtime was not found.";
                    try { File.AppendAllText(logPath, "[Error] " + err + "\n"); } catch { }
                    MessageBox.Show(
                        "Node.js runtime was not found.\nPlease install Node.js (https://nodejs.org) to run Z.E.M.O.",
                        "Node.js Required",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning
                    );
                    return;
                }

                try { File.AppendAllText(logPath, string.Format("[Info] Node: {0}, Script: {1}\n", nodeExe, launcherScript)); } catch { }

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodeExe;
                psi.Arguments = string.Format("\"{0}\"", launcherScript);
                psi.WorkingDirectory = Path.GetDirectoryName(Path.GetDirectoryName(launcherScript));
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                using (Process proc = Process.Start(psi))
                {
                    proc.WaitForExit();
                }
            }
            catch (Exception ex)
            {
                try { File.AppendAllText(logPath, "[Exception] " + ex.ToString() + "\n"); } catch { }
                MessageBox.Show(
                    "An unexpected error occurred while launching Z.E.M.O.:\n" + ex.Message,
                    "Z.E.M.O. Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
            finally
            {
                if (appMutex != null)
                {
                    appMutex.ReleaseMutex();
                    appMutex.Dispose();
                }
            }
        }

        private static string FindNodeExecutable()
        {
            // Check PATH first
            string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
            string[] dirs = pathEnv.Split(';');
            foreach (string d in dirs)
            {
                try
                {
                    string candidate = Path.Combine(d.Trim(), "node.exe");
                    if (File.Exists(candidate)) return candidate;
                }
                catch { }
            }

            // Check standard installation paths
            string[] standardPaths = new string[]
            {
                @"C:\Program Files\nodejs\node.exe",
                @"C:\Program Files (x86)\nodejs\node.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\nodejs\node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"npm\node.exe")
            };

            foreach (string p in standardPaths)
            {
                if (File.Exists(p)) return p;
            }

            return null;
        }
    }
}
