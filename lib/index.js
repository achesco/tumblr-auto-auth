var oauth = require('oauth').OAuth,
    async = require('async'),
    tumblr = require('tumblr.js'),
    fs = require('fs'),
    uuid = require('node-uuid'),
    express = require('express'),
    path = require('path'),
    slimerjs = require('slimerjs');

var childProcess = require('child_process'),
    childArgs = [path.join(__dirname, 'slimer-script.js')];

var config = {
    tumblrLoginUrl: 'https://www.tumblr.com/login?from_splash=1',
    tumblrRequestTokenUrl: 'http://www.tumblr.com/oauth/request_token',
    tumblrAuthorizeUrl: 'http://www.tumblr.com/oauth/authorize',
    tumblrAccessTokenUrl: 'http://www.tumblr.com/oauth/access_token',
    port: 9992,
    localHost: 'localhost',
    callbackAutoUri: 'tumblr-auth'
};

var defaults = {
    debug: false
};

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
                    log('Trying to resume with cached keys');
                    fs.readFile('.'+ options.userEmail +'.keys', next);
                },
                function (data, next) {
                    log('Cached keys found');
                    var access;
                    try {
                        access = JSON.parse(data);
                    }
                    catch (error) {
                        access = {};
                    }
                    next(null, access);
                },
                function (access, next) {
                    if (!access.hasOwnProperty('accessToken') || !access.hasOwnProperty('accessSecret')) {
                        log('Cached keys are incorrect');
                        next('incorrect keys');
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
                            log('Cached keys are incorrect or expired');
                        }
                        next(err, client);
                    });
                }
            ],
            callback);
    };

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

        async.waterfall([
            function (next) {
                log('Requesting temporary tokens...');
                clientsHash[uid].getOAuthRequestToken(next);
            },
            function (token, tokenSecret, parsedQueryString, next) {
                options.token = token;
                options.tokenSecret = tokenSecret;
                log('Temporary tokens obtained successfully')
                log('Starting authentication process')

                Object.keys(options).forEach(function (key) {
                    childArgs.push(key + '=' + options[key]);
                });
                Object.keys(config).forEach(function (key) {
                    childArgs.push(key + '=' + config[key]);
                });
                childProcess.execFile(slimerjs.path, childArgs, function(err, stdout, stderr) {
                    debug(stdout);
                    next(err);
                });
            }
        ], function (err) {
            if (err) {
                callback(err);
            }
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
                log('Requesting temporary tokens...');
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
                log('Resume failed, creating new client');
                createNewClient(callbacksHash[uid]);
            }
            else {
                log('Client resumed successfully');;
                callbacksHash[uid](null, client);
            }
        });
    }

    function log(message) {
        console.log(message);
    }

    function debug(message) {
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

    resume : function () {
        if (this.app === null) {

            this.app = express();
            this.server = this.app.listen(config.port, config.localHost);

            this.app.get('/' + config.callbackUri + '/:uid', function (req, rootRes) {
                var uid = [req.param('uid')];
                var options = optionsHash[uid];
                console.log('Callback received for UID: ' + uid);
                clientsHash[uid].getOAuthAccessToken(
                    req.query['oauth_token'], options.tokenSecret, req.query['oauth_verifier'], function (err, accessToken, accessSecret, res) {
                        fs.writeFile('.' + options.userEmail + '.keys', JSON.stringify({
                            accessToken: accessToken,
                            accessSecret: accessSecret
                        }));
                        callbacksHash[uid] && callbacksHash[uid](null, tumblr.createClient({
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
                                '<p>Callback from tumblr received.</p>' +
                                '<p>Following data received:</p>' +
                                '<p>Access token: <code>'+ accessToken +'</code><br />' +
                                'Aceess secret: <code>'+ accessSecret +'</code></p>' +
                                (options.manual ? '<p>Credentials saved to .'+ options.userEmail +'.keys file, you can use <code>getAuthorizedClient</code> now</p>' : '')
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

function extend (options) {

    [].slice.call(arguments, 1).forEach(function (source) {
        for (var prop in source) {
            options[prop] = source[prop];
        }
    });

    return options;
}
