'use strict';
const { readFile } = require('node:fs/promises');
const { createRequire, isBuiltin, Module } = require('node:module');
const { dirname, extname, isAbsolute, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  createContext,
  SourceTextModule,
  SyntheticModule
} = require('node:vm');
const isWindows = process.platform === 'win32';

function isRelativePath(p) {
  return p.charCodeAt(0) === '.' &&
    (
      p.length === 1 ||
      p.charCodeAt(1) === '/' ||
      (isWindows && p.charCodeAt(1) === '\\') ||
      (p.charCodeAt(1) === '.' && ((
        p.length === 2 ||
        p.charCodeAt(2) === '/') ||
        (isWindows && p.charCodeAt(2) === '\\')))
    );
}

function hookRequire(before, after) {
  if (typeof before !== 'function' && before !== undefined) {
    throw new TypeError('before must be a function');
  }

  if (typeof after !== 'function' && after !== undefined) {
    throw new TypeError('after must be a function');
  }

  const original = Module.prototype.require;

  Module.prototype.require = function(id) {
    if (typeof before === 'function') {
      Reflect.apply(before, this, [id]);
    }

    try {
      return Reflect.apply(original, this, [id]);
    } finally {
      if (typeof after === 'function') {
        Reflect.apply(after, this, [id]);
      }
    }
  };

  return function restore() {
    Module.prototype.require = original;
  };
}

function specifierToPath(specifier, referencingModuleId) {
  // Convert the specifier into an absolute path (unless this is a core module).
  if (isBuiltin(specifier) || isAbsolute(specifier)) {
    return specifier;
  } else if (isRelativePath(specifier)) {
    return resolve(dirname(referencingModuleId), specifier);
  } else {
    // The specifier is something in node_modules/.
    const req = createRequire(referencingModuleId);

    return req.resolve(specifier);
  }
}

// TODO(cjihrig): Add input validation (use vm.isContext()).

async function createSourceTextModule(specifier, referencingModule) {
  const absolutePath = specifierToPath(specifier, referencingModule.identifier);
  const moduleSource = await readFile(absolutePath, 'utf8');
  const sourceTextModule = new SourceTextModule(moduleSource, {
    identifier: specifier,
    context: referencingModule.context,
    initializeImportMeta(meta) {
      meta.url = pathToFileURL(absolutePath).href;
      meta.resolve = () => {
        throw new Error('unimplemented');
      };
    },
    async importModuleDynamically(specifier, script) {
      const mod = await link(specifier, script);

      await mod.link(link);
      await mod.evaluate();

      return mod;
    }
  });

  return sourceTextModule;
}

async function createSyntheticModule(specifier, referencingModule) {
  const id = isBuiltin(specifier) ? specifier :
    pathToFileURL(
      specifierToPath(specifier, referencingModule.identifier)
    ).href;
  const mod = await import(id);
  const modExports = Object.keys(mod);
  const syntheticModule = new SyntheticModule(modExports, () => {
    for (let i = 0; i < modExports.length; i++) {
      const exportName = modExports[i];

      syntheticModule.setExport(exportName, mod[exportName]);
    }
  }, {
    identifier: specifier,
    context: referencingModule.context
  });

  return syntheticModule;
}

function link(specifier, referencingModule) {
  // TODO(cjihrig): Support module caching.

  if (isBuiltin(specifier)) {
    return createSyntheticModule(specifier, referencingModule);
  }

  const absolutePath = specifierToPath(specifier, referencingModule.identifier);
  const extension = extname(absolutePath);

  if (extension === '.mjs') {
    return createSourceTextModule(absolutePath, referencingModule);
  } else if (extension === '.cjs') {
    return createSyntheticModule(absolutePath, referencingModule);
  } else if (extension === '.js') {
    // TODO(cjihrig): .js files need to search for the closest package.json
    // file and check its "type" field.
    return createSyntheticModule(absolutePath, referencingModule);
  }

  throw new Error(`cannot load '${specifier}'`);
}

async function run(filename, options) {
  if (!isAbsolute(filename)) {
    throw new Error('filename must be an absolute path');
  }

  const context = options?.context ?? createContext();
  const mod = await createSourceTextModule(filename, {
    identifier: __filename,
    context
  });

  await mod.link(link);
  await mod.evaluate();

  return mod;
}

module.exports = {
  createSourceTextModule,
  createSyntheticModule,
  hookRequire,
  run,
  specifierToPath
};
