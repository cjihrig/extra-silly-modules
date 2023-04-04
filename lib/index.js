'use strict';
const { readFile } = require('node:fs/promises');
const { isBuiltin } = require('node:module');
const { pathToFileURL } = require('node:url');
const {
  createContext,
  SourceTextModule,
  SyntheticModule
} = require('node:vm');

// TODO(cjihrig): Add input validation (use vm.isContext()).

async function createSourceTextModule(specifier, referencingModule) {
  const absolutePath = require.resolve(specifier);
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
  // TODO(cjihrig): The exports logic can be made more robust.
  const syntheticModule = new SyntheticModule(['default'], () => {
    syntheticModule.setExport('default', mod.default);
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
  const context = options?.context ?? createContext();
  const mod = await createSourceTextModule(filename, { context });

  await mod.link(link);
  await mod.evaluate();

  return mod;
}

module.exports = {
  createSourceTextModule,
  createSyntheticModule,
  run
};
