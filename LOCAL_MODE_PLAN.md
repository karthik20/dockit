# Dockit — Local/Offline Mode Implementation Plan

## Problem Statement

Users behind corporate proxies cannot download from Maven Central, GitHub, or arbitrary URLs. They need alternatives that:
- Respect local Maven infrastructure (`~/.m2/settings.xml` with proxy/mirror configs)
- Work with pre-downloaded repositories and artifacts
- Do not require outbound internet access

## Design: Additive Optional Fields

No new source types, no discriminator unions. Each existing config type gets new **optional** fields. If provided and valid, the local field takes precedence at build time.

### New Config Fields

```typescript
interface ZipSourceConfig {
  url?: string;
  localPath?: string;       // NEW: absolute path to local .zip file
}

interface MavenSourceConfig {
  groupId: string;
  artifactId: string;
  version: string;
  classifier?: string;
  useMavenCommand?: boolean; // NEW: spawn mvn dependency:copy instead of HTTP
  localJar?: string;         // NEW: path to pre-downloaded .jar file
}

interface AntoraSourceConfig {
  repoUrl?: string;
  zipPath?: string;
  localPath?: string;        // NEW: pre-cloned local directory
  playbookOverrides?: Record<string, unknown>;
}

interface AsciidocSourceConfig {
  repoUrl?: string;
  zipPath?: string;
  localPath?: string;        // NEW: pre-cloned local directory
  sourcePath?: string;
}
```

### Precedence Logic (checked at build time)

For ZIP: `localPath` > `url` > error  
For Maven: `localJar` > `useMavenCommand` > HTTP fetch > error  
For Antora/AsciiDoc: `localPath` > `repoUrl` > `zipPath` > error

---

## Implementation Steps

### Step 1: Update Types (server + client)

**Files:**
- `apps/server/src/types.ts` — add `localPath`, `localJar`, `useMavenCommand`
- `apps/client/src/types.ts` — mirror server types

No migration needed — fields are optional, existing configs continue working.

---

### Step 2: ZIP Service (`services/zip.ts`)

**Current:** `downloadAndExtractZip(url: string, targetDir, log)` — HTTP fetch only.

**After:**

```typescript
// New function
export async function extractLocalZip(
  localPath: string,
  targetDir: string,
  log: (msg: string) => void
): Promise<void>

// Refactored main function
export async function downloadAndExtractZip(
  config: ZipSourceConfig,
  targetDir: string,
  log: (msg: string) => void
): Promise<void> {
  if (config.localPath) {
    await extractLocalZip(config.localPath, targetDir, log);
  } else if (config.url) {
    // existing HTTP download logic
  } else {
    throw new Error('ZIP source requires url or localPath');
  }
}
```

`extractLocalZip` validates file exists, pipes through `unzipper.Extract`. Error if path is a directory.

**Call site change:** `buildPipeline.ts` line 64: `downloadAndExtractZip(config.url, ...)` → `downloadAndExtractZip(config as ZipSourceConfig, ...)`.

---

### Step 3: Maven Service (`services/maven.ts`)

**Current:** `downloadAndExtractMavenJar(config, targetDir, log)` — HTTP fetch only.

**New functions:**

```typescript
// Spawns: mvn org.apache.maven.plugins:maven-dependency-plugin:3.10.0:copy
//   -Dartifact=groupId:artifactId:version:jar:classifier
//   -DoutputDirectory=targetDir
export async function downloadWithMavenCommand(
  config: MavenSourceConfig,
  targetDir: string,
  log: (msg: string) => void
): Promise<void>

// Reads local .jar file, extracts via unzipper
export async function extractLocalJar(
  localJarPath: string,
  targetDir: string,
  log: (msg: string) => void
): Promise<void>
```

**Refactored main function:**

```typescript
export async function downloadAndExtractMavenJar(
  config: MavenSourceConfig,
  targetDir: string,
  log: (msg: string) => void
): Promise<void> {
  if (config.localJar) {
    await extractLocalJar(config.localJar, targetDir, log);
  } else if (config.useMavenCommand) {
    await downloadWithMavenCommand(config, targetDir, log);
  } else {
    // existing HTTP download (buildMavenUrl + fetch)
  }
}
```

**Error messages:**
- `mvn` not in PATH → `"mvn command not found. Install Maven or use direct download mode."`
- localJar not found → `"Local JAR not found at /path/to/file.jar"`
- localJar is not a `.jar` → `"localJar must be a .jar file"`

**Maven plugin version:** Hardcoded `maven-dependency-plugin:3.10.0` (latest stable).

---

### Step 4: AsciiDoc Service (`services/asciidoc.ts`)

**Current:** `buildAsciidocSource` clones repo or extracts ZIP → converts → cleans up.

**After:** Add `localPath` branch that skips clone/extract and uses the provided directory as-is. Crucially, **do not clean up** user-provided directories.

```typescript
export async function buildAsciidocSource(
  config: AsciidocSourceConfig,
  targetDir: string,
  log: (msg: string) => void
): Promise<void> {
  let repoDir: string;
  let shouldCleanup: boolean;

  if (config.localPath) {
    if (!fs.existsSync(config.localPath) || !fs.statSync(config.localPath).isDirectory()) {
      throw new Error(`Local path not found or not a directory: ${config.localPath}`);
    }
    repoDir = config.localPath;
    shouldCleanup = false;
  } else if (config.repoUrl) {
    repoDir = path.join(os.tmpdir(), `dockit-asciidoc-${Date.now()}`);
    await cloneRepo(config.repoUrl, repoDir, log);
    shouldCleanup = true;
  } else if (config.zipPath) {
    repoDir = path.join(os.tmpdir(), `dockit-asciidoc-${Date.now()}`);
    fs.mkdirSync(repoDir, { recursive: true });
    await extractZip(config.zipPath, repoDir, log);
    shouldCleanup = true;
  } else {
    throw new Error('AsciiDoc source requires repoUrl, localPath, or zipPath');
  }

  // ... rest same (findAdocFiles, runAsciidoctor, etc.) ...

  } finally {
    if (shouldCleanup && fs.existsSync(repoDir)) {
      log('Cleaning up cloned repository...');
      rmDir(repoDir);
    }
  }
}
```

---

### Step 5: Antora Service (`services/antora.ts`)

**Current:** `buildAntoraSource` clones or extracts → generates playbook → runs antora.

**After:** Add `localPath` branch. Antora's `workDir` is in `data/{entryId}/antora/{sourceId}/` — always cleaned on next build, so no explicit cleanup needed.

```typescript
export async function buildAntoraSource(
  config: AntoraSourceConfig,
  entryId: string,
  workDir: string,
  log: (msg: string) => void
): Promise<string> {
  const contentDir = path.join(workDir, 'content');

  if (config.localPath) {
    if (!fs.existsSync(config.localPath) || !fs.statSync(config.localPath).isDirectory()) {
      throw new Error(`Local path not found or not a directory: ${config.localPath}`);
    }
    // Copy or symlink? Use the local dir directly as contentDir (read-only, no copy needed)
    // But antora-playbook.yml needs to be written inside workDir
    // Strategy: point playbook content source URL to the localPath
    contentDir_alias = config.localPath;  // use for playbook generation
  } else if (config.repoUrl) {
    await cloneRepo(config.repoUrl, contentDir, log);
    contentDir_alias = contentDir;
  } else if (config.zipPath) {
    await extractZip(config.zipPath, contentDir, log);
    contentDir_alias = contentDir;
  } else {
    throw new Error('Antora source requires repoUrl, localPath, or zipPath');
  }

  // ... generate playbook using contentDir_alias ...
  // If localPath, clone is skipped — antora reads directly from the user's directory
}
```

Actually, review of `generatePlaybook`: it uses `contentDir` as the `url` in the playbook's content sources. For localPath, we can point the playbook's content source to the user's local directory instead of the workDir/content path. This avoids copying.

---

### Step 6: Build Pipeline Call Sites

**`buildPipeline.ts`** (already extracted from `routes/build.ts`) — ZIP case currently passes `config.url`:
```typescript
case 'zip': {
  const config = source.config as ZipSourceConfig;
  await downloadAndExtractZip(config.url, sourceDir, log);  // ← change
}
```
Change to pass full config:
```typescript
case 'zip': {
  const config = source.config as ZipSourceConfig;
  await downloadAndExtractZip(config, sourceDir, log);  // ← pass full config
}
```

Maven, Antora, AsciiDoc already pass full config objects — no change needed for call sites.

**`routes/build.ts`** — now delegates to `buildPipeline.buildEntry()` — no additional changes needed.

---

### Step 7: Config Loader (`services/configLoader.ts`)

Update `buildSourceConfig()` to pass through new fields:

```typescript
case 'zip':
  return { url: source.url, localPath: source.localPath };
case 'maven':
  return {
    groupId: source.groupId!,
    artifactId: source.artifactId!,
    version: source.version!,
    classifier: source.classifier || 'javadoc',
    useMavenCommand: source.useMavenCommand,
    localJar: source.localJar,
  };
case 'antora':
  return {
    repoUrl: source.repoUrl,
    zipPath: source.zipPath,
    localPath: source.localPath,
    playbookOverrides: source.playbookOverrides,
  };
case 'asciidoc':
  return {
    repoUrl: source.repoUrl,
    zipPath: source.zipPath,
    localPath: source.localPath,
    sourcePath: source.sourcePath,
  };
```

Update `DockitSourceConfig` interface to include new fields: `localPath`, `localJar`, `useMavenCommand`.

---

### Step 8: SourceForm UI (`SourceForm.tsx`)

Add mode state per source type, radio buttons to toggle between remote and local.

**ZIP section:**
```
┌─────────────────────────────────────────┐
│ Source Type: ● Remote URL  ○ Local File │
│                                         │
│ [When Remote:]                          │
│   URL: [_____________________________]  │
│                                         │
│ [When Local:]                           │
│   Path: [_____________________________] │
│   Server path, e.g. /home/user/docs.zip │
└─────────────────────────────────────────┘
```

**Maven section:**
```
┌───────────────────────────────────────────┐
│ Mode: ● Direct  ○ Maven CLI  ○ Local JAR  │
│                                           │
│ [All modes show: Group ID, Artifact, Ver] │
│ [When CLI: note about settings.xml]       │
│ [When Local: file path input]             │
└───────────────────────────────────────────┘
```

**Antora section:**
```
┌─────────────────────────────────────────────┐
│ Source: ● Git Repo  ○ Local Dir  ○ ZIP File │
│                                             │
│ [When Git:]     repoUrl input               │
│ [When Local:]   localPath input             │
│ [When ZIP:]     zipPath input               │
└─────────────────────────────────────────────┘
```

**AsciiDoc section:**
```
┌──────────────────────────────────────────────┐
│ Source: ● Git Repo  ○ Local Dir  ○ ZIP File  │
│                                              │
│ [Same as Antora + sourcePath field always]   │
└──────────────────────────────────────────────┘
```

New state variables: `zipMode`, `mavenMode`, `antoraMode`, `adocMode` with defaults `'remote'`/`'direct'`/`'git'`.

`handleSubmit` builds config based on selected mode, including the correct fields.

`initial` prop populates mode from existing config (e.g., if config has `localPath`, set mode to `'local'`).

---

### Step 9: YAML Config (`dockit.yaml`)

Add commented examples:

```yaml
  # Local/Offline mode examples:
  # - id: quarkus-local
  #   name: Quarkus (Local)
  #   version: "3.35"
  #   sources:
  #     - type: asciidoc
  #       label: "Quarkus Docs (local clone)"
  #       localPath: "/home/user/repos/quarkus"
  #       sourcePath: "docs/src/main/asciidoc"
  #
  # - id: quarkus-mvn
  #   name: Quarkus Core (Maven CLI)
  #   version: "3.35.2"
  #   sources:
  #     - type: maven
  #       label: "Quarkus Core Javadoc"
  #       groupId: "io.quarkus"
  #       artifactId: "quarkus-core"
  #       version: "3.35.2"
  #       useMavenCommand: true
  #
  # - id: company-docs
  #   name: Company Docs
  #   version: "1.0"
  #   sources:
  #     - type: zip
  #       label: "Docs ZIP"
  #       localPath: "/home/user/downloads/docs.zip"
```

---

### Step 10: Documentation Updates

**README.md additions:**
- "Offline/Proxy Mode" section with config field table
- MCP section (how to run, Claude Desktop config)

**PLAN.md additions:**
- New config shapes with localPath/localJar/useMavenCommand
- Updated pipeline: localPath branch descriptions
- MCP server architecture section
- New services: configLoader, textExtractor, buildPipeline
- Design decisions: localPath consistency, build-time validation, maven-dependency-plugin:3.10.0
- Add to file tree: `src/mcp.ts`, `src/services/configLoader.ts`, `src/services/textExtractor.ts`, `src/services/buildPipeline.ts`, `SKILL.md`, `dockit.yaml`

---

## Testing Strategy (11 manual test cases)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1 | ZIP local file (UI) | Create entry, add ZIP with localPath to real `.zip`, build | ZIP extracted, docs visible |
| 2 | ZIP local file (YAML) | Add to dockit.yaml, sync, MCP build | Same as above |
| 3 | Maven localJar (UI) | Maven source with localJar pointing to real `.jar`, build | JAR extracted |
| 4 | Maven useMavenCommand (UI) | Maven source with flag, build | `mvn dependency:copy` spawned |
| 5 | Maven useMavenCommand (YAML) | dockit.yaml with flag, MCP build | Same |
| 6 | Antora localPath (UI) | Antora source with localPath to antora repo, build | Skips clone, uses local dir |
| 7 | Antora localPath (YAML) | dockit.yaml, MCP build | Same |
| 8 | AsciiDoc localPath (UI) | AsciiDoc source with localPath + sourcePath, build | Uses local dir, converts .adoc |
| 9 | AsciiDoc localPath (YAML) | dockit.yaml, MCP build | Same |
| 10 | Precedence: both localPath + url | Source has both fields | localPath wins, url ignored |
| 11 | Error: missing localPath file | Build with nonexistent path | Clear error in build log |

## Questions Resolved

| Question | Answer |
|----------|--------|
| Maven plugin version | `maven-dependency-plugin:3.10.0` (hardcoded) |
| Field naming | `localPath` for all types |
| Validation timing | Build time (not config sync) |
