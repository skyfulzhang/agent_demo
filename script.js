import {htmlReport} from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/latest/dist/bundle.js';
import {textSummary} from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import http from 'k6/http';
import {check} from 'k6';
import {Trend, Rate} from 'k6/metrics';

export const getContactsDuration = new Trend('get_contacts', true);
export const RateContentOK = new Rate('content_OK');

export const options = {
    thresholds: {
        http_req_failed: ['rate<0.30'], get_contacts: ['p(99)<500'], content_OK: ['rate>0.95']
    }, stages: [{duration: '10s', target: 2}, {duration: '10s', target: 4}, {duration: '10s', target: 6}]
};

export function handleSummary(data) {
    return {
        'result.html': htmlReport(data), stdout: textSummary(data, {indent: ' ', enableColors: true})
    };
}

export default function () {
    const baseUrl = 'https://httpbin.org/get';

    const params = {
        headers: {
            'Content-Type': 'application/json'
        }
    };

    const OK = 200;

    const res = http.get(`${baseUrl}`, params);

    getContactsDuration.add(res.timings.duration);

    RateContentOK.add(res.status === OK);

    check(res, {
        'GET Contacts - Status 200': () => res.status === OK
    });
}
