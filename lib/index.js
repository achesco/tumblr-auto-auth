var oauth = require('oauth').OAuth,
	zombie = require('zombie'),
	async = require('async'),
	tumblr = require('tumblr.js'),
	fs = require('fs'),
	uuid = require('node-uuid');

var config = {
	tumblrRequestTokenUrl: "http://www.tumblr.com/oauth/request_token",
	tumblrAuthorizeUrl: "http://www.tumblr.com/oauth/authorize",
	tumblrAccessTokenUrl: "http://www.tumblr.com/oauth/access_token",
	port: 9992,
	localHost: 'localhost'
};

var defaults = {
	debug: false
}

var callbacksHash ={},
	optionsHash = {},
	clientsHash = {};

var TumblrAutoAuthClient = function (options) {

	var options = extend({}, defaults, options);
	var uid = uuid.v4();

	var getClient = function () {

		async.waterfall([
			
			function (next) {
				fs.readFile('.' + options.userEmail + '.keys', function (err, data) {
					try {
						if (err) throw "failed";
						var access = JSON.parse(data);
						if (!access.hasOwnProperty('accessToken') || !access.hasOwnProperty('accessSecret')) {
							throw "failed";
						}
						var client = tumblr.createClient({
							consumer_key: options.appConsumerKey,
							consumer_secret: options.appSecretKey,
							token: access.accessToken,
							token_secret: access.accessSecret
						});
						client.userInfo(function (err, data) {
							if (err) {
								next(null, false);
							}
							else {
								next(null, client);
							}
						});
					}
					catch (err) {
						next(null, false);
					}
				})
			},

			function (client, callback) {
				if (!client) {
					var client = new oauth(
						config.tumblrRequestTokenUrl,
						config.tumblrAccessTokenUrl,
						options.appConsumerKey,
						options.appSecretKey,
						'1.0A',
						'http://' + config.localHost + ':' + config.port + '/post2tumblr/' + uid,
						'HMAC-SHA1'
					);
					clientsHash[uid] = client;
					var browser = new zombie({
						loadCSS: false,
						runScripts: false,
						userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25',
						waitFor: 3001,
						debug: options.debug
					});
					async.waterfall([
						function (next) {
							if (options.debug) console.log('Requesting temporary tokens...');
							client.getOAuthRequestToken(next);
						},
						function (token, tokenSecret, parsedQueryString, next) {
							options.token = token;
							options.tokenSecret = tokenSecret;
							browser.visit(config.tumblrAuthorizeUrl + '?oauth_token=' + options.token, next);
						},
						function (next) {
							browser
								.fill("user[email]", options.userEmail)
								.fill("user[password]", options.userPassword)
								.pressButton("Submit", next);
						},
						function (next) {
							browser.visit(config.tumblrAuthorizeUrl + '?oauth_token=' + options.token, next);
						},
						function (next) {
							browser.pressButton('button[name="allow"]', next);
						}
					]);
				}
				else {
					callback(null, client);
				}
			}
		], function (err, client) {
			callbacksHash[uid](client);
		});
	}

	return {
		authenticate: function (callback) {
			getExpressApp();

			callbacksHash[uid] = callback;
			optionsHash[uid] = options;

			try {
				getClient();
			}
			catch (err) {
				getClient();
			}
		}
	}
};

module.exports = {
	getAuthorizedClient : function ( options, callback) {
		new TumblrAutoAuthClient(options)
			.authenticate(callback);
	}
};

var expressApp = null;
var getExpressApp = function () {
	if (expressApp === null) {
		expressApp = require('express')();
		expressApp.listen(config.port, config.localHost);
		expressApp.get('/post2tumblr/:uid', function (req, res) {
			var uid = [req.param('uid')];
			console.log('Callback received for UID: ' + uid);
			var options = optionsHash[uid];
			clientsHash[uid].getOAuthAccessToken(
				req.query['oauth_token'], options.tokenSecret, req.query['oauth_verifier'], function (err, accessToken, accessSecret, res) {
					fs.writeFile('.' + options.userEmail + '.keys', JSON.stringify({
						accessToken: accessToken,
						accessSecret: accessSecret
					}));
					callbacksHash[uid](tumblr.createClient({
						consumer_key: options.appConsumerKey,
						consumer_secret: options.appSecretKey,
						token: accessToken,
						token_secret: accessSecret
					}));
				});
		});
	}
	return expressApp;
}

var extend = function (options) {

	[].slice.call(arguments, 1).forEach(function (source) {
		for (var prop in source) {
			options[prop] = source[prop];
		}
	});
	
	return options;
}
