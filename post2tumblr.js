var oauth = require('oauth').OAuth,
	zombie = require('zombie'),
	async = require('async'),
	app = require('express')(),
	tumblr = require('tumblr.js'),
	fs = require('fs'),
	assert = require('assert'),
	commander = require('commander');

var config = {
	defaultPort: 8882,
	tumblrRequestTokenUrl: "http://www.tumblr.com/oauth/request_token",
	tumblrAuthorizeUrl: "http://www.tumblr.com/oauth/authorize",
	tumblrAccessTokenUrl: "http://www.tumblr.com/oauth/access_token"
};
config.localhostUrl = "http://localhost:" + config.defaultPort + "/";
var credentials = {};

commander
	.option('-c, --credentials <credentialsFilePath>', 'mandatory, specify credentials file path')
	.option('-t, --tasks <tasksFile>', 'optional, specify JSON tasks file path')
	.option('-p, --port <localPort>', 'optional, specify port to bind to, '+ config.defaultPort +' by default', config.defaultPort)
	.option('-d, --debug', 'optional, dump debug information to output');

commander.on('--help', function(){
	console.log('  Examples:');
	console.log('');
	console.log('    Perform posts described in tasks.json');
	console.log('       $ node post2tumblr.js --credentials credentials.json  --tasks tasks.json');
	console.log('');
	console.log('    Run tool and access it with your web-browser');
	console.log('       $ node post2tumblr.js --credentials credentials.json -p 8882');
	console.log('       Go to http://localhost:8882/');
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

	assert.doesNotThrow(function () {
		var parsed = JSON.parse(fs.readFileSync(commander.credentials));
		for (key in parsed) {
			credentials[key] = parsed[key];
		}
	}, Error, "Failed to parse credentials file, must contain valid JSON");

	assert.equal(typeof credentials.userEmail, "string", "'userEmail' must be specified in credentials");

	assert.equal(typeof credentials.userPassword, "string", "'userPassword' must be specified in credentials");
}
catch (err) {
	console.error('  error: ' + err.message.replace('Got unwanted exception (Error). ', ''));
	process.exit();
}

app.listen(commander.port, 'localhost');

function getClient (clientCallback) {

	async.waterfall([

		function (callback) {
			try {
				var access = JSON.parse(fs.readFileSync('.post2tumblr.access'));
				if (!access.hasOwnProperty('accessToken') || !access.hasOwnProperty('accessSecret')) {
					throw "1";
				}
				var client = tumblr.createClient({
					consumer_key: credentials.appConsumerKey,
					consumer_secret: credentials.appSecretKey,
					token: access.accessToken,
					token_secret: access.accessSecret
				});
				client.userInfo(function (err, data) {
					if (err) {
						callback(null, false);
					}
					else {
						callback(null, client);
					}
				});
			}
			catch (err) {
				callback(null, false);
			}
		},
		function (client, callback) {

			if (!client) {
				var client = new oauth(
					config.tumblrRequestTokenUrl,
					config.tumblrAccessTokenUrl,
					credentials.appConsumerKey,
					credentials.appSecretKey,
					'1.0A',
					config.localhostUrl + 'post2tumblr',
					'HMAC-SHA1'
				);
				var browser = new zombie({
					loadCSS: false,
					runScripts: false,
					userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25',
					waitFor: 3001,
					debug: commander.debug
				});

				async.waterfall([
					function (next) {
						if (commander.debug) console.log('Requesting temporary tokens...');
						client.getOAuthRequestToken(next);
					},
					function (token, tokenSecret, parsedQueryString, next) {
						credentials.token = token;
						credentials.tokenSecret = tokenSecret;
						browser.visit(config.tumblrAuthorizeUrl + '?oauth_token=' + credentials.token, next);
					},
					function (next) {
						browser
							.fill("user[email]", credentials.userEmail)
							.fill("user[password]", credentials.userPassword)
							.pressButton("Submit", next);
					},
					function (next) {
						browser.visit(config.tumblrAuthorizeUrl + '?oauth_token=' + credentials.token, next);
					},
					function (next) {
						browser.pressButton('button[name="allow"]', next);
					}
				]);

				app.get('/post2tumblr', function (req, res) {
					client.getOAuthAccessToken(
						req.query['oauth_token'], credentials.tokenSecret, req.query['oauth_verifier'],
						function (err, accessToken, accessSecret, results) {
							fs.writeFileSync('.post2tumblr.access', JSON.stringify({
								accessToken: accessToken,
								accessSecret: accessSecret
							}));
							callback(null, tumblr.createClient({
								consumer_key: credentials.appConsumerKey,
								consumer_secret: credentials.appSecretKey,
								token: accessToken,
								token_secret: accessSecret
							}));
						});
				});
			}
			else {
				callback(null, client);
			}
		}
	], function (err, client) {
		clientCallback(client);
	});
}

var main = function (client) {
	var controller = require('./app/controller.js')(client);
	app.get('/', controller.index);
}

try {
	getClient(main);
}
catch (err) {
	getClient(main);
}


