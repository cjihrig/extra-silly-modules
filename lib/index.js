'use strict';
const { readFile } = require('node:fs/promises');
const { isBuiltin } = require('node:module');
const { dirname, isAbsolute, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  createContext,
  SourceTextModule,
  SyntheticModule
} = require('node:vm');

// TODO(cjihrig): Add input validation (use vm.isContext()).

async function createSourceTextModule(specifier, referencingModule) {
  let absolutePath;

  if (isAbsolute(specifier)) {
    absolutePath = specifier;
  } else if (isBuiltin(specifier)) {
    throw new Error('specifier cannot be a builtin module');
  } else {
    absolutePath = resolve(dirname(referencingModule.identifier), specifier);
  }

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
  const mod = await import(specifier);
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
  if (isBuiltin(specifier)) {
    return createSyntheticModule(specifier, referencingModule);
  } else {
    return createSourceTextModule(specifier, referencingModule);
  }
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
  run
};
