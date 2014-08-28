var options = require('./credentials.json');

require('./lib/index').getAuthorizedClient(options, function (error, client) {
        if (!error) {
            client.userInfo(function (error, data) {
                console.log(data);
            });
        }
        else {
            console.log(error);
        }
    });
