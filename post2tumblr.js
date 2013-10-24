var oauth = require('oauth').OAuth;
var credentials = require("./credentials");
var zombie = require('zombie');
var async = require('async');
var app = require('express')();
var tumblr = require('tumblr.js');
var util = require('util');

var client = new oauth(
	'http://www.tumblr.com/oauth/request_token',
	'http://www.tumblr.com/oauth/access_token',
	credentials.consumerKey,
	credentials.secretKey,
	'1.0A',
	'http://127.0.0.1:8882/post2tumblr',
	'HMAC-SHA1'
);

var browser = new zombie({
	loadCSS: false,
	runScripts: false,
	userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/30.0.1599.101 Safari/537.36',
	waitFor: 2001,
	site: 'http://www.tumblr.com',
	debug: false
});

async.waterfall([
	function (next) {
		client.getOAuthRequestToken(next);
	},
	function (token, tokenSecret, parsedQueryString, next) {
		credentials.token = token;
		credentials.tokenSecret = tokenSecret;
		browser.visit('http://www.tumblr.com/oauth/authorize?oauth_token=' + credentials.token, next);
	},
	function (next) {
		browser
			.fill("user[email]", credentials.userEmail)
			.fill("user[password]", credentials.userPassword)
			.pressButton("Submit", next);
	},
	function (next) {
		browser.visit('http://www.tumblr.com/oauth/authorize?oauth_token=' + credentials.token, next);
	},
	function (next) {
		browser.pressButton('button[name="allow"]', next);
	}
]);

app.get('/post2tumblr', function (req, res) {
	client.getOAuthAccessToken(
		req.query['oauth_token'], credentials.tokenSecret, req.query['oauth_verifier'],
		function (err, accessToken, accessSecret, results) {
			main(tumblr.createClient({
				consumer_key: credentials.consumerKey,
				consumer_secret: credentials.secretKey,
				token: accessToken,
				token_secret: accessSecret
			}));
		});
});

app.listen(8882);

function main (client) {

	client.userInfo(function (err, data) {
		console.log(util.inspect(data, false, null));
	});

}
