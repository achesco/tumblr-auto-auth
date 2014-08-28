var options = require('./credentials.json');

options.debug = true;


require('./lib/index').interactiveAuthorization(options, function (error, client) {
        if (!error) {
            client.userInfo(function (error, data) {
                console.log(data);
            });
        }
        else {
            console.log(error);
        }
    });
