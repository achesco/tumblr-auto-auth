# tumblr-auto-auth

Automatic oauth-authenticated tumblr client creation tool.

## Overview

Module provides two ways to complete the 3-legged oauth process with minimal efforts and returns authenticated
[tumblr.js](https://github.com/tumblr/tumblr.js) client instance to callback.

## Installation

1. Install module via node package manager:

	> npm install tumblr-auto-auth

2. Register application with tumblr.
2.1. [Visit registration form](http://www.tumblr.com/oauth/register).
2.2. Fill form with data:

*application name: `tumblr-auto-auth`
*application website: `https://github.com/chesco-als/tumblr-auto-auth`
*administrative contact email: fill in your email address
*default callback URL: `http://localhost:9992/tumblr-auth`

2.3. Note `OAuth Consumer Key` and `Secret Key`[from your account apps page](http://www.tumblr.com/oauth/apps).

## Usage

### Hands free way

This method isn't considered as reliable. In a long-term perspective especially.
Sometime tumblr responds with "page not found" code or request timeout can be too long
or tumblr html code contains some irregularities and it fails accomplishment of the authentication process.

Once it's done, received keys will be stored to file named `.{your@email}.keys` and can be used
till expiration occurs.

```js
require('tumblr-auto-auth').getAuthorizedClient({
		userEmail: "your@email",
		userPassword: "Your_Tumblr_Password",
		appConsumerKey: "OAuth_Consumer_Key",
		appSecretKey: "Secret_Key",
		debug: true
	},
	function (error, client) {
		client.userInfo(...)
	});
```

Once process successfully completed, callback fired with fully-featured tumblr client as an argument.
[Refer to tumblr.js page](https://github.com/tumblr/tumblr.js) and [tumblr API documentation](http://www.tumblr.com/docs/en/api/v2)
for the client's possibilities.

### One hand way

This is reliable way for oauth keys obtaining. It involves some user action but doesn't require your account password
being hardcoded. Once process is done, received keys will be stored to file named `.{your@email}.keys` and can be used
by `getAuthorizedClient` method automatically.

```js
require('tumblr-auto-auth').interactiveAuthorization({
		userEmail: "your@email",
		appConsumerKey: "OAuth_Consumer_Key",
		appSecretKey: "Secret_Key",
		debug: true
	},
	function (error, client) {
		client.userInfo(...)
	});
```

Follow the instructions of console and browser output.

After `interactiveAuthorization` method done, received keys will be stored to file named `.{your@email}.keys` and can
be used by `getAuthorizedClient` method automatically.

## `.{your@email}.keys` file

Those files will be created (updated if keys become invalid) every time either authorization method will be applied.
Keep them safe because they can be used for tumbl-account full access. Once such a file created, `getAuthorizedClient`
will try to use it first before new authentication process will be started. So, you can use such code till key
file is valid:

```js
require('tumblr-auto-auth').getAuthorizedClient({
		appConsumerKey: "OAuth_Consumer_Key",
		appSecretKey: "Secret_Key"
	},
	function (error, client) {
		client.userInfo(...)
	});
```
