const path = require('path');
const currentDir = __dirname;

// Add server's node_modules to module resolution path so api/ code can find deps
const nodePaths = process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [];
nodePaths.push(path.join(currentDir, 'node_modules'));
process.env.NODE_PATH = nodePaths.join(path.delimiter);
require('module').Module._initPaths();

const app = require('../api/index');
