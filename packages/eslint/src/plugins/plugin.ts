import {
  CreateNodes,
  CreateNodesContext,
  TargetConfiguration,
} from '@nx/devkit';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import { combineGlobPatterns } from 'nx/src/utils/globs';
import {
  ESLINT_CONFIG_FILENAMES,
  findBaseEslintFile,
  isFlatConfig,
} from '../utils/config-file';

export interface EslintPluginOptions {
  targetName?: string;
}

export const createNodes: CreateNodes<EslintPluginOptions> = [
  combineGlobPatterns(['**/project.json', '**/package.json']),
  (configFilePath, options, context) => {
    const projectRoot = dirname(configFilePath);

    options = normalizeOptions(options);

    const eslintConfigs = getEslintConfigsForProject(
      projectRoot,
      context.workspaceRoot
    );
    if (!eslintConfigs.length) {
      return {};
    }

    return {
      projects: {
        [projectRoot]: {
          targets: buildEslintTargets(
            eslintConfigs,
            projectRoot,
            options,
            context
          ),
        },
      },
    };
  },
];

function getEslintConfigsForProject(
  projectRoot: string,
  workspaceRoot: string
): string[] {
  const detectedConfigs = new Set<string>();
  const baseConfig = findBaseEslintFile(workspaceRoot);
  if (baseConfig) {
    detectedConfigs.add(baseConfig);
  }

  let siblingFiles = readdirSync(join(workspaceRoot, projectRoot));

  if (projectRoot === '.') {
    // If there's no src folder, it's not a standalone project
    if (!siblingFiles.includes('src')) {
      return [];
    }
    // If it's standalone but doesn't have eslint config, it's not a lintable
    const config = siblingFiles.find((f) =>
      ESLINT_CONFIG_FILENAMES.includes(f)
    );
    if (!config) {
      return [];
    }
    detectedConfigs.add(config);
    return Array.from(detectedConfigs);
  }
  while (projectRoot !== '.') {
    // if it has an eslint config it's lintable
    const config = siblingFiles.find((f) =>
      ESLINT_CONFIG_FILENAMES.includes(f)
    );
    if (config) {
      detectedConfigs.add(`${projectRoot}/${config}`);
      return Array.from(detectedConfigs);
    }
    projectRoot = dirname(projectRoot);
    siblingFiles = readdirSync(join(workspaceRoot, projectRoot));
  }
  // check whether the root has an eslint config
  const config = readdirSync(workspaceRoot).find((f) =>
    ESLINT_CONFIG_FILENAMES.includes(f)
  );
  if (config) {
    detectedConfigs.add(config);
    return Array.from(detectedConfigs);
  }
  return [];
}

function buildEslintTargets(
  eslintConfigs: string[],
  projectRoot: string,
  options: EslintPluginOptions,
  context: CreateNodesContext
) {
  const isRootProject = projectRoot === '.';

  const targets: Record<string, TargetConfiguration> = {};

  const baseTargetConfig: TargetConfiguration = {
    command: `eslint ${isRootProject ? './src' : '.'}`,
    options: {
      cwd: projectRoot,
    },
  };
  if (eslintConfigs.some((config) => isFlatConfig(config))) {
    baseTargetConfig.options.env = {
      ESLINT_USE_FLAT_CONFIG: 'true',
    };
  }

  targets[options.targetName] = {
    ...baseTargetConfig,
    cache: true,
    inputs: [
      'default',
      ...eslintConfigs.map((config) => `{workspaceRoot}/${config}`),
      '{workspaceRoot}/tools/eslint-rules/**/*',
      { externalDependencies: ['eslint'] },
    ],
    options: {
      ...baseTargetConfig.options,
    },
  };

  return targets;
}

function normalizeOptions(options: EslintPluginOptions): EslintPluginOptions {
  options ??= {};
  options.targetName ??= 'lint';
  return options;
}
