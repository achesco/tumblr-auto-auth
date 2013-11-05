var commander = require('commander'),
	fs = require('fs'),
	assert = require('assert')
	;

commander
	.option('-c, --credentials <credentialsFilePath>', 'mandatory, specify credentials file path')
	.option('-i, --init', 'register post2tumblr for your account')
	.option('-t, --tasks <tasksFile>', 'optional, specify JSON tasks file path')
	.option('-p, --port <localPort>', 'optional, specify port to bind to, "8882" by default', 8882);

commander.on('--help', function(){
	console.log('  Examples:');
	console.log('');
	console.log('    1. Register post2tumblr for your account (run at first)');
	console.log('       $ node post2tumblr.js --credentials credentials.json  --init');
	console.log('');
	console.log('    2. Perform posts described in tasks.json');
	console.log('       $ node post2tumblr.js --credentials credentials.json  --tasks tasks.json');
	console.log('');
	console.log('    3. Run tool and access it with your web-browser');
	console.log('       $ node post2tumblr.js --credentials credentials.json -p 8181');
	console.log('       Go to http://localhost:8181/');
	console.log('');
	console.log('  Refer to https://github.com/chesco-als/post2tumblr for explanation of options.');
	console.log('');
});

commander.parse(process.argv);

try {
	assert.notEqual(typeof commander.credentials, "undefined", "Credentials file must be defined");
	assert.doesNotThrow(function () {
		var stat = fs.statSync(commander.credentials);
		if (!stat.isFile()) {
			throw 'not file';
		}
	}, Error, "Failed to load passed credentials file");
	if (commander.tasks) {
		assert.doesNotThrow(function () {
			var stat = fs.statSync(commander.tasks);
			if (!stat.isFile()) throw 'not file';
		}, Error, "Failed to load passed tasks file");
	}
	if (commander.port) {
		assert.equal(commander.port, parseInt(commander.port), "Port must be a number")
	}
}
catch (err) {
	console.error('  error: ' + err.message.replace('Got unwanted exception (Error). ', ''));
}

module.exports = commander;
