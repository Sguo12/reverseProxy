#!/usr/bin/env /usr/local/bin/node

var httpProxy = require('http-proxy');
var https = require('https');
var fs = require('fs');
var util = require('util');
var argv = require('minimist')(process.argv.slice(2));

var port = argv.p || 3000;
var scServer = argv.s || 'www.google.com'

if (argv.h) {
    console.log("node proxy.js [-p port] [-s ServerYouWantToProxy]");
    return;
}

//
// pending test actions
//
var pendingActions = [];
//
// possible pending actions/API end points
//
var actionTypes = ['return401', 'return500', 'passthrough', 'droprequest', 'longtimeout'];

function return401Action(req, res) {
    res.writeHead(401, {
                  'Content-Type': 'text/plain'
                  });

    res.end('Token expired');
}

function return500Action(req, res) {
    res.writeHead(500, {
                  'Content-Type': 'text/plain'
                  });

    res.end('Really bad things happened');
}

function passthroughAction(req, res) {
    req.headers.host = scServer;
    proxy.web(req, res, { target: 'https://' + scServer });
}

function droprequestAction(req, res) {

}

function longtimeoutAction(req, res) {
    setTimeout(function() {
               req.headers.host = scServer;
               proxy.web(req, res, { target: 'https://' + scServer });
               }, 75000);
}

// api end point action table
var actionTable = {return401 : return401Action,
    return500 : return500Action,
    passthrough : passthroughAction,
    droprequest : droprequestAction,
    longtimeout : longtimeoutAction
};

//
// use thse options to start our local https server
//
var options = {
    key: fs.readFileSync('./self-ssl.key'),
    cert: fs.readFileSync('./self-ssl.crt')
};

//
// Create a proxy server with custom application logic
//
var proxy = httpProxy.createProxyServer({});

//
// our API end point
//
function processOurAPI(req, res) {
    var query = require('url').parse(req.url,true).query;

    //
    // when we set a new test value, we clear all other
    // leftover flags! this makes sure that we get a fresh start
    //
    pendingActions = [];

    for (var property in query) {
        if (actionTypes.indexOf(property) < 0) {
            res.writeHead(400, {
                'Content-Type': 'text/plain'
            });

            res.end(property + ' is not a valid action');
            return;
        }

        if (isNaN(query[property]) || query[property] < 1 || query[property] > 10000) {
            res.writeHead(400, {
                          'Content-Type': 'text/plain'
                          });

            res.end(property + '=' + query[property] + ' is a valid value');
            return;
        }

        // add the action to the pending fifo
        pendingActions.push({count : Math.floor(query[property]),
                            callback : actionTable[property]});
    }

    res.writeHead(200, {
        'Content-Type': 'application/json'
    });

    res.end(JSON.stringify(pendingActions));
}

//
// process each pending action in-order
//
function processPendingActions(req, res) {
    var action = pendingActions.shift();
    console.log(util.inspect(action));

    action.callback(req, res);

    action.count--;
    if (action.count > 0) {
        pendingActions.unshift(action);
    }
}

//
// create a https server and watch all the requests coming in,
// for our own api, process it, otherwise pass to the proxy
//
https.createServer(options, function (req, res) {
    console.log("got path: " + req.url);
    console.log("got method: " + req.method);
    console.log("got header: " + util.inspect(req.headers));

    if (req.url.substr(0, 22) == '/api/testproxy/actions') {
        processOurAPI(req, res);

    } else if (pendingActions.length > 0) {
        processPendingActions(req, res);

    } else {
        req.headers.host = scServer;
        proxy.web(req, res, { target: 'https://' + scServer });

        req.on("data", function(part) {
            console.log('got data: ' + part.toString());
        });
    }
}).listen(port);


proxy.on('error', function (err, req, res) {
    res.writeHead(500, {
        'Content-Type': 'text/plain'
    });

    res.end('Something went wrong. And we are reporting a custom error message.');
});

proxy.on('proxyRes', function (res) {
    console.log('RAW Response from the target', JSON.stringify(res.headers, true, 2));
});

console.log('Listening on port ' + port + ', proxying to ' + scServer);

