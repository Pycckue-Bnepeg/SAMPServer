var traceur = require('traceur');

traceur.require.makeDefault(function(filename) {
  return filename.indexOf('node_modules') === -1;
}, { 
	experimental: true, 
	asyncFunctions: true, 
	arrayComprehension: true,
	exponentiation: true, 
	generatorComprehension: true, 
	memberVariables: true, 
	symbols: true, 
	types: true 
});

require('./src/app.js');