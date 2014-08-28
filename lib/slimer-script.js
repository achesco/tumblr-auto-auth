var page = require('webpage').create(),
    testindex = 0,
    loadInProgress = false,
    params = {};

page.settings.loadImages = false;

page.viewportSize = {
    width: 320,
    height: 240
};

phantom.args.forEach(function (argStr) {
    var arg = argStr.split('=');
    params[arg[0]] = arg.slice(1).join("");
});

page.onConsoleMessage = function(msg) {
    console.log('message: ' + msg);
};

page.onLoadStarted = function() {
    loadInProgress = true;
};

page.onLoadFinished = function() {
    loadInProgress = false;
};

var steps = [
    function () {
        page.open(params.tumblrLoginUrl);
    },
    function () {
        page.evaluate(function (params) {
            document.getElementById('signup_email').value = params.userEmail;
            document.getElementById('signup_password').value = params.userPassword;
            document.getElementById('signup_form').submit();
        }, params);
    },
    function () {
        page.open(params.tumblrAuthorizeUrl + '?oauth_token=' + params.token);
    },
    function () {
        page.evaluate(function () {
            document.getElementsByName('allow')[0].click();
        });
    },
    function () {
        phantom.exit();
    }
];

setInterval(function () {
    if (!loadInProgress && typeof steps[testindex] == "function") {
        console.log("step " + (testindex + 1));
        steps[testindex]();
        testindex++;
    }
}, 50);
