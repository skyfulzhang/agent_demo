import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/2.4.0/dist/bundle.js'; 
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import http from 'k6/http';
import { check, sleep } from 'k6';  
import { Trend, Rate } from 'k6/metrics';

export const getContactsDuration = new Trend('get_contacts', true);
export const RateContentOK = new Rate('content_OK');

export const options = {
    thresholds: {
        http_req_failed: ['rate<0.1'],  
        get_contacts:    ['p(95)<500'],
        content_OK:      ['rate>0.95']
    },
    stages: [
        { duration: '10s', target: 10 },
        { duration: '10s', target: 20 },
        { duration: '10s', target: 30 }
    ]
};

export function handleSummary(data) {
    return {
        'result.html': htmlReport(data),
        'summary.json': JSON.stringify(data),
        stdout: textSummary(data, { indent: ' ', enableColors: true })
    };
}

export default function () {
    const baseUrl = 'https://httpbin.org/get';

    const params = {
        headers: { 'Content-Type': 'application/json' }
    };

    const res = http.get(baseUrl, params);

    getContactsDuration.add(res.timings.duration);
    RateContentOK.add(res.status === 200);

    check(res, {
        'GET - Status 200': (r) => r.status === 200,
        'GET - Duration < 500ms': (r) => r.timings.duration < 500, 
    });

    sleep(1); 
}
