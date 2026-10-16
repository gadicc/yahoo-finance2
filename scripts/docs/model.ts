import { readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import ts from "typescript";
import { stripVTControlCharacters } from "node:util";
import {
  inputSnapshot,
  verifyPrograms,
  verifyAdditionalInput,
} from "./inputs.ts";
import {
  Application,
  Converter,
  Logger,
  LogLevel,
  OptionDefaults,
  type Reflection,
  normalizePath,
  type DeclarationReflection,
  type CommentDisplayPart,
  TSConfigReader,
  Renderer,
  type Router,
} from "typedoc";
import { load } from "typedoc-plugin-missing-exports";
import { sourceProvenance, sourceUrl } from "./provenance.ts";
import externalLinks from "./external-links.json" with { type: "json" };

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

export interface Diagnostic {
  level: number;
  message: string;
}
export interface LinkProof {
  owner: number;
  original: string;
  target: number;
  label: string;
  tag: string;
}

/** Normalize checkout location, but retain the symbol, warning and source identity. */
export function diagnosticKey(message: string, root: string): string {
  return message
    .replaceAll(`${root.replaceAll("\\", "/")}/`, "")
    .replaceAll(`${root}/`, "")
    .replaceAll("<unknown>/", "")
    .replaceAll("\\", "/");
}

export function warningDelta(current: Diagnostic[], baseline: Diagnostic[]) {
  const counts = (items: Diagnostic[]) => {
    const result = new Map<string, number>();
    for (const item of items) {
      const key = JSON.stringify(item);
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  };
  const now = counts(current),
    before = counts(baseline);
  const difference = (a: Map<string, number>, b: Map<string, number>) =>
    [...a].flatMap(([key, n]) =>
      n > (b.get(key) ?? 0)
        ? [{ ...(JSON.parse(key) as Diagnostic), count: n - (b.get(key) ?? 0) }]
        : [],
    );
  return { added: difference(now, before), resolved: difference(before, now) };
}

function defaultName(file: string): string | undefined {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const node of source.statements) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      )
    ) {
      return node.name?.text;
    }
  }
}

export function normalizeDenoLinks(
  project: { reflections: Record<number, Reflection> },
  modules: Map<string, DeclarationReflection>,
  exports: Record<string, string>,
  root: string,
): LinkProof[] {
  const proof: LinkProof[] = [];
  const parts = (owner: Reflection, content: CommentDisplayPart[]) => {
    for (const part of content) {
      if (
        part.kind !== "inline-tag" ||
        !["@link", "@linkcode", "@linkplain"].includes(part.tag)
      )
        continue;
      const original = part.text;
      let target: DeclarationReflection | undefined;
      let label: string;
      const bracket = /^\[([^\]]+)\](?:\.([\w$]+))?(?:\s+(.*))?$/.exec(
        original,
      );
      if (bracket) {
        const [, key, member, text] = bracket;
        const source = exports[`./${key}`];
        const module = source && modules.get(resolve(root, source));
        if (!module)
          throw new Error(`Unknown Deno documentation module: ${original}`);
        target = member
          ? module.children?.find((child) => child.name === member)
          : module;
        if (!target && member === defaultName(resolve(root, source))) {
          target = module.children?.find((child) => child.name === "default");
        }
        if (!target)
          throw new Error(`Unknown Deno documentation member: ${original}`);
        label = (text || member || key) ?? "";
      } else if (original === "../../~/default.html | default") {
        const source = exports["."];
        target = source
          ? modules
              .get(resolve(root, source))
              ?.children?.find((child) => child.name === "default")
          : undefined;
        if (!target)
          throw new Error("Root default documentation reflection is missing");
        label = "default";
      } else continue;
      part.target = target;
      part.text = label;
      proof.push({
        owner: owner.id,
        original,
        target: target.id,
        label,
        tag: part.tag,
      });
    }
  };
  for (const owner of Object.values(project.reflections)) {
    if (!owner.comment) continue;
    parts(owner, owner.comment.summary);
    for (const tag of owner.comment.blockTags) parts(owner, tag.content);
  }
  return proof;
}

export async function generateModel(
  root: string,
  output: string,
  inputFingerprint: string,
) {
  const provenance = sourceProvenance(root);
  const inputs = inputSnapshot(root);
  if (inputs.fingerprint !== inputFingerprint)
    throw new Error("Documentation inputs changed before conversion");
  const metadata = JSON.parse(
    readFileSync(resolve(root, "deno.json"), "utf8"),
  ) as { exports: Record<string, string> };
  const diagnostics: Diagnostic[] = [];
  class Capture extends Logger {
    override log(message: string, level: LogLevel) {
      super.log(message, level);
      if (level === LogLevel.Warn || level === LogLevel.Error) {
        diagnostics.push({ level, message: diagnosticKey(message, root) });
      }
    }
  }
  const app = await Application.bootstrap(
    {
      entryPoints: [...new Set(Object.values(metadata.exports))].map((file) =>
        resolve(root, file),
      ),
      entryPointStrategy: "resolve",
      tsconfig: resolve(root, "tsconfig.library.json"),
      readme: "none",
      name: "yahoo-finance2",
      disableGit: true,
      basePath: root,
      displayBasePath: root,
      // TypeDoc requires a template to retain source positions with Git disabled.
      // This tracking-only value is replaced or cleared before any rendering.
      sourceLinkTemplate: "{path}#L{line}",
      validation: {
        notExported: true,
        invalidLink: true,
        invalidPath: true,
        rewrittenLink: true,
        notDocumented: true,
        unusedMergeModuleWith: true,
      },
      blockTags: [...OptionDefaults.blockTags, "@yf-schema", "@discriminator"],
      externalSymbolLinkMappings: externalLinks,
      cleanOutputDir: false,
    },
    [new TSConfigReader()],
  );
  // Bootstrap uses TypeDoc's own logger. Its diagnostics are already visible;
  // reject them before installing the conversion diagnostic collector.
  if (app.logger.hasErrors() || app.logger.hasWarnings()) {
    throw new Error(
      `TypeDoc bootstrap reported ${app.logger.errorCount} error(s) and ${app.logger.warningCount} warning(s); see startup diagnostics`,
    );
  }
  app.logger = new Capture();
  if (inputs.typedocOverrides.length)
    throw new Error(
      `TypeDoc option overrides in compiler configs are unsupported by this wrapper: ${inputs.typedocOverrides.join(", ")}; configure owned scripts/docs/model.ts instead`,
    );
  const watchFile = app.watchFile.bind(app);
  app.watchFile = (file, restart) => {
    verifyAdditionalInput(inputs, file);
    watchFile(file, restart);
  };
  load(app);
  // Pinned plugin 4.1.4 resolves missing exports at priority 1e9. Exclude only its
  // dependency expansion; ordinary conversion retains inherited public members.
  app.converter.on(
    Converter.EVENT_RESOLVE_BEGIN,
    () => app.options.setValue("excludeExternals", true),
    Number.MAX_SAFE_INTEGER,
  );
  app.converter.on(
    Converter.EVENT_END,
    () => app.options.setValue("excludeExternals", false),
    -100,
  );
  const emitErrors = () => {
    const errors = diagnostics.filter((item) => item.level === LogLevel.Error);
    let remaining = 16000;
    let shown = 0;
    for (const error of errors.slice(0, 20)) {
      const message = stripVTControlCharacters(error.message).slice(
        0,
        Math.min(1600, remaining),
      );
      if (!message) break;
      console.error(`[docs:error] ${message}`);
      remaining -= message.length;
      shown++;
    }
    if (shown < errors.length)
      console.error(
        `[docs:error] ${errors.length - shown} further errors omitted`,
      );
  };
  const entryPoints = app.getEntryPoints();
  if (!entryPoints) {
    emitErrors();
    throw new Error("TypeDoc entry point discovery failed");
  }
  verifyPrograms(inputs, [
    ...new Set(entryPoints.map((entry) => entry.program)),
  ]);
  // Convert the same verified program objects, rather than discovering a second program.
  app.getEntryPoints = () => entryPoints;
  const project = await app.convert();
  if (!project) {
    emitErrors();
    throw new Error("TypeDoc conversion failed");
  }
  for (const file of app.files.getMediaPaths())
    verifyAdditionalInput(inputs, file);
  const modules = new Map<string, DeclarationReflection>();
  for (const module of project.children ?? []) {
    for (const source of module.sources ?? [])
      modules.set(resolve(root, source.fileName), module);
  }
  const coverage = Object.entries(metadata.exports).map(([key, source]) => {
    const module = modules.get(resolve(root, source));
    if (!module)
      throw new Error(`Undocumented public export: ${key} (${source})`);
    return { key, source, moduleId: module.id, name: module.name };
  });
  // A dependency upgrade must not silently expose Node/Zod or other foreign
  // declarations as project-internal exports.
  const internals = Object.values(project.reflections).filter((reflection) => {
    for (let parent = reflection.parent; parent; parent = parent.parent) {
      if (parent.name === "<internal>") return true;
    }
    return false;
  });
  for (const reflection of internals) {
    const sources = (reflection as DeclarationReflection).sources ?? [];
    for (const source of sources) {
      const file = relative(root, source.fullFileName).replaceAll("\\", "/");
      if (!file.startsWith("src/"))
        throw new Error(`Foreign internal documentation: ${file}`);
    }
  }
  // Every final source URL is derived from verified commit bytes; archives,
  // dirty source and dependency declarations retain positions without links.
  for (const reflection of Object.values(project.reflections)) {
    for (const source of (reflection as DeclarationReflection).sources ?? []) {
      source.url = sourceUrl(
        provenance,
        root,
        source.fullFileName,
        source.line,
      );
    }
  }
  const links = normalizeDenoLinks(project, modules, metadata.exports, root);
  app.validate(project);
  let router: Router | undefined;
  app.renderer.on(Renderer.EVENT_END, () => {
    router = app.renderer.router;
  });
  await app.generateDocs(project, output);
  if (app.logger.hasErrors()) {
    emitErrors();
    throw new Error("TypeDoc reported errors");
  }
  const urls = new Map<number, string>();
  for (const reflection of Object.values(project.reflections)) {
    if (router?.hasUrl(reflection)) {
      urls.set(reflection.id, router.getFullUrl(reflection));
    }
  }
  for (const row of coverage) {
    if (!urls.get(row.moduleId))
      throw new Error(`Public export lacks HTML: ${row.key}`);
  }
  for (const link of links) {
    if (!urls.get(link.target))
      throw new Error(`Deno link lacks HTML target: ${link.original}`);
  }
  const renderedLinks = links.map((link) => {
    const owner = required(
      project.reflections[link.owner],
      "Link owner disappeared",
    );
    const target = required(
      project.reflections[link.target],
      "Link target disappeared",
    );
    const targetUrl = required(
      urls.get(link.target),
      "Link target URL disappeared",
    );
    if (!router?.hasUrl(owner))
      return {
        ...link,
        url: targetUrl,
        rendered: false,
        ownerName: owner.getFullName(),
      };
    const ownerUrl = router.getFullUrl(owner),
      href = router.relativeUrl(owner, target);
    const html = readFileSync(
      resolve(output, ownerUrl.split("#")[0] ?? ""),
      "utf8",
    );
    if (!html.includes(`href="${href.replaceAll("&", "&amp;")}"`)) {
      throw new Error(`Deno link was not rendered: ${link.original}`);
    }
    const [file, anchor] = targetUrl.split("#");
    const targetHtml = readFileSync(resolve(output, file ?? ""), "utf8");
    if (anchor && !targetHtml.includes(`id="${anchor}"`))
      throw new Error(`Missing Deno link anchor: ${targetUrl}`);
    return { ...link, url: targetUrl, ownerUrl, href, rendered: true };
  });
  if (JSON.stringify(sourceProvenance(root)) !== JSON.stringify(provenance)) {
    throw new Error(
      "Source provenance changed during documentation generation",
    );
  }
  const model = app.serializer.projectToObject(project, normalizePath(root));
  writeFileSync(resolve(output, "reflections.json"), JSON.stringify(model));
  const report = {
    tool: "typedoc@0.28.20",
    sourceProvenance: provenance,
    inputFingerprint,
    inputInventory: inputs.inventory,
    typescript: app.getTypeScriptVersion(),
    coverage: coverage.map((row) => ({ ...row, url: urls.get(row.moduleId) })),
    normalizedLinks: renderedLinks,
    reflectionCount: Object.keys(project.reflections).length,
    internalCount: internals.length,
    diagnostics,
  };
  writeFileSync(
    resolve(output, "documentation-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}
