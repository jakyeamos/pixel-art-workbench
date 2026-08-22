import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";

const MACOS_ASEPRITE = "/Applications/Aseprite.app/Contents/MacOS/aseprite";

interface AsepriteBundleOptions {
  readonly outputDirectory: string;
  readonly executable?: string;
}

function executableFromPath(name: string): string | null {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(directory, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveAsepriteExecutable(explicit?: string): string | null {
  const configured = explicit ?? process.env.ASEPRITE_BIN;
  if (configured) return existsSync(configured) ? configured : null;
  return (
    executableFromPath("aseprite") ??
    (existsSync(MACOS_ASEPRITE) ? MACOS_ASEPRITE : null)
  );
}

export async function createAsepriteBundle(
  options: AsepriteBundleOptions,
): Promise<string> {
  const executable = resolveAsepriteExecutable(options.executable);
  if (!executable)
    throw new Error(
      "Aseprite was requested but no executable was found. Set ASEPRITE_BIN or pass --aseprite-bin.",
    );
  const scriptPath = join(
    options.outputDirectory,
    "build-aseprite-project.lua",
  );
  const projectPath = join(options.outputDirectory, "underpainting.aseprite");
  const script = [
    "local base = Sprite{fromFile=app.params.base}",
    "if base == nil then error('Could not load underpainting') end",
    "base.layers[1].name = 'Underpainting - human cleanup required'",
    "local function addDiagnostic(name, path)",
    "  local source = Sprite{fromFile=path}",
    "  if source == nil then error('Could not load diagnostic: ' .. path) end",
    "  local layer = base:newLayer()",
    "  layer.name = name",
    "  layer.isVisible = false",
    "  base:newCel(layer, 1, source.cels[1].image)",
    "  source:close()",
    "end",
    "addDiagnostic('Diagnostic - protected edges', app.params.edges)",
    "addDiagnostic('Diagnostic - cluster cleanup', app.params.cleanup)",
    "base:saveAs(app.params.output)",
    "base:close()",
    "",
  ].join("\n");
  await writeFile(scriptPath, script, "utf8");
  const run = spawnSync(
    executable,
    [
      "-b",
      "--script-param",
      `base=${join(options.outputDirectory, "underpainting.png")}`,
      "--script-param",
      `edges=${join(options.outputDirectory, "diagnostic-edges.png")}`,
      "--script-param",
      `cleanup=${join(options.outputDirectory, "diagnostic-cleanup.png")}`,
      "--script-param",
      `output=${projectPath}`,
      "--script",
      scriptPath,
    ],
    { encoding: "utf8" },
  );
  if (run.error) throw run.error;
  if (run.status !== 0) {
    const detail = [run.stderr, run.stdout]
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n");
    throw new Error(
      `Aseprite exited with status ${run.status ?? "unknown"}${run.signal ? ` (${run.signal})` : ""}: ${detail}`,
    );
  }
  return projectPath;
}
