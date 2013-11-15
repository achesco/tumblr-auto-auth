var oauth = require('oauth').OAuth,
	zombie = require('zombie'),
	async = require('async'),
	tumblr = require('tumblr.js'),
	fs = require('fs'),
	uuid = require('node-uuid');

var config = {
	tumblrLogoutUrl: "http://www.tumblr.com/logout",
	tumblrRequestTokenUrl: "http://www.tumblr.com/oauth/request_token",
	tumblrAuthorizeUrl: "http://www.tumblr.com/oauth/authorize",
	tumblrAccessTokenUrl: "http://www.tumblr.com/oauth/access_token",
	port: 9992,
	localHost: 'localhost',
	callbackAutoUri: 'tumblr-auth'
};

var defaults = {
	debug: false,
	browserDebug: false
}

var callbacksHash ={},
	optionsHash = {},
	clientsHash = {};

var TumblrAutoAuthClient = function (options) {

	var options = extend({}, defaults, options);
	var uid = uuid.v4();

	optionsHash[uid] = options;

	var resumeClient = function (callback) {

		async.waterfall([
			function (next) {
				debug('Trying to resume with cached keys');
				fs.readFile("."+ options.userEmail +".keys", next);
			},
			function (data, next) {
				var access = JSON.parse(data);
				debug('Cached keys found');
				next(null, access);
			},
			function (access, next) {
				if (!access.hasOwnProperty('accessToken') || !access.hasOwnProperty('accessSecret')) {
					debug('Cached keys are incorrect');
					next("incorrect keys");
				}
				else {
					next(null, tumblr.createClient({
						consumer_key: options.appConsumerKey,
						consumer_secret: options.appSecretKey,
						token: access.accessToken,
						token_secret: access.accessSecret
					}))
				}
			},
			function (client, next) {
				client.userInfo(function (err, data) {
					if (err) {
						debug('Cached keys are incorrect or expired');
					}
					next(err, client);
				});
			}
		],
			callback);
	}

	var createNewClient = function (callback) {
		ExpressApp.resume();
		
		clientsHash[uid] = new oauth(
			config.tumblrRequestTokenUrl,
			config.tumblrAccessTokenUrl,
			options.appConsumerKey,
			options.appSecretKey,
			'1.0A',
			'http://' + config.localHost + ':' + config.port + '/' + config.callbackUri + '/' + uid,
			'HMAC-SHA1'
		);
		var browser = new zombie({
			loadCSS: false,
			runScripts: false,
			userAgent: 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1; .NET CLR 1.1.4322)',
			waitFor: 3001,
			silent: true,
			debug: options.browserDebug
		});

		async.waterfall([
			function (next) {
				browser.visit(config.tumblrLogoutUrl, function (err) {
					next(null);
				});
			},
			function (next) {
				debug('Requesting temporary tokens...');
				clientsHash[uid].getOAuthRequestToken(next);
			},
			function (token, tokenSecret, parsedQueryString, next) {
				options.token = token;
				options.tokenSecret = tokenSecret;
				debug('Temporary tokens obtained successfully')
				debug('Starting authentication process')
				browser.visit(config.tumblrAuthorizeUrl + '?oauth_token=' + options.token, next);
			},
			function (next) {
				try {
					browser
						.fill("user[email]", options.userEmail)
						.fill("user[password]", options.userPassword)
						.pressButton("Submit", next);
				}
				catch (err) {
					next(err);
				}
			},
			function (next) {
				browser.visit(config.tumblrAuthorizeUrl + '?oauth_token=' + options.token, next);
			},
			function (next) {
				try {
					browser.pressButton('button[name="allow"]', next);
				}
				catch (err) {
					next(err)
				}
			}
		], function (err) {
			if (err) {
				callback(err);
			}
			// else - do nothing, waiting for callback
		});
	}

	var createManually = function () {
		ExpressApp.resume();

		clientsHash[uid] = new oauth(
			config.tumblrRequestTokenUrl,
			config.tumblrAccessTokenUrl,
			options.appConsumerKey,
			options.appSecretKey,
			'1.0A',
			'http://' + config.localHost + ':' + config.port + '/' + config.callbackManualUri + '/' + uid,
			'HMAC-SHA1'
		);

		async.waterfall([
			function (next) {
				debug('Requesting temporary tokens...');
				clientsHash[uid].getOAuthRequestToken(next);
			},
			function (token, tokenSecret, parsedQueryString, next) {
				options.token = token;
				options.tokenSecret = tokenSecret;
				console.log('Please, visit link with your browser and follow onscreen instructions:');
				console.log(config.tumblrAuthorizeUrl + '?oauth_token=' + options.token);
			}
		], function (err) {
			if (err) {
				console.error(err);
			}
			// else - do nothing, waiting for callback
		});
	}

	var registerCallback = function (callback) {
		callbacksHash[uid] = function (error, client) {
			delete callbacksHash[uid];
			ExpressApp.stop();
			callback(error, client);
		}
	}

	var getClient = function () {
		resumeClient(function (err, client) {
			if (err) {
				debug('Resume failed, creating new client');
				createNewClient(callbacksHash[uid]);
			}
			else {
				debug('Client resumed successfully');;
				callbacksHash[uid](null, client);
			}
		});
	}

	var debug = function (message) {
		if (options.debug) {
			console.log(message);
		}
	}

	return {
		authenticate: function (callback) {
			registerCallback(callback);
			try {
				getClient();
			}
			catch (error) {
				callbacksHash[uid](error);
			}
		},
		manual: function (callback) {
			if (callback) {
				registerCallback(callback);
			}
			optionsHash[uid].manual = true;
			createManually();
		}
	}
};

module.exports = {
	getAuthorizedClient : function ( options, callback ) {
		new TumblrAutoAuthClient(options)
			.authenticate(callback);
	},
	interactiveAuthorization : function ( options, callback ) {
		new TumblrAutoAuthClient(options)
			.manual(callback);
	}
};

var ExpressApp = {

	app : null,
	server : null,
	test: 'test',

	resume : function () {
		if (this.app === null) {

			this.app = require('express')();
			this.server = this.app.listen(config.port, config.localHost);

			this.app.get('/' + config.callbackUri + '/:uid', function (req, rootRes) {
				var uid = [req.param('uid')];
				var options = optionsHash[uid];
				if (options.debug) {
					console.log('Callback received for UID: ' + uid);
				}
				clientsHash[uid].getOAuthAccessToken(
					req.query['oauth_token'], options.tokenSecret, req.query['oauth_verifier'], function (err, accessToken, accessSecret, res) {
						fs.writeFile('.' + options.userEmail + '.keys', JSON.stringify({
							accessToken: accessToken,
							accessSecret: accessSecret
						}));
						callbacksHash[uid] && callbacksHash[uid](tumblr.createClient({
							consumer_key: options.appConsumerKey,
							consumer_secret: options.appSecretKey,
							token: accessToken,
							token_secret: accessSecret
						}));
						if (options.manual) {
							console.log('Access token: ' + accessToken);
							console.log('Access secret: ' + accessSecret);
						}
						rootRes.send(
							"<p>Callback from tumblr received.</p>" +
								"<p>Following data received:</p>" +
								"<p>Access token: <code>"+ accessToken +"</code><br />" +
								"Aceess secret: <code>"+ accessSecret +"</code></p>" +
								(options.manual ? "<p>Credentials saved to ."+ options.userEmail +".keys file, you can use <code>getAuthorizedClient</code> now</p>" : "")
						);
					});
			});
		}
	},

	stop: function () {
		for (var key in callbacksHash) {
			if (hasOwnProperty.call(callbacksHash, key)) {
				return false;
			}
		}
		this.server && this.server.close();
	}
};

var extend = function (options) {

	[].slice.call(arguments, 1).forEach(function (source) {
		for (var prop in source) {
			options[prop] = source[prop];
		}
	});
	
	return options;
}
