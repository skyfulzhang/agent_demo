/**
 * k6 负载测试脚本
 */

import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/2.4.0/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ─────────────────────────────────────────
// 自定义指标
// ─────────────────────────────────────────
export const getContactsDuration = new Trend('get_contacts', true);
export const RateContentOK       = new Rate('content_OK');
export const ErrorCount          = new Counter('error_count');

// ─────────────────────────────────────────
// 测试配置
// ─────────────────────────────────────────
export const options = {

  // 跟随重定向（默认最多跟随10次）
  redirects: 10,

  thresholds: {
    // 失败率 < 10%
    http_req_failed: ['rate<0.1'],
    // P95 响应时间 < 2000ms（公共接口适当放宽）
    get_contacts:    ['p(95)<2000'],
    // 内容正确率 > 90%
    content_OK:      ['rate>0.9'],
    // HTTP 请求耗时 P95 < 2000ms
    http_req_duration: ['p(95)<2000'],
  },

  stages: [
    { duration: '10s', target: 5  },   // 缓慢爬坡，避免瞬间压垮公共接口
    { duration: '15s', target: 10 },
    { duration: '15s', target: 15 },
    { duration: '10s', target: 0  },   // 优雅降载
  ],
};

// ─────────────────────────────────────────
// 测试目标配置（主 + 备用）
// ─────────────────────────────────────────
const TARGETS = {
  primary: 'https://www.baidu.com/',
  backup1: 'https://httpbingo.org/get',    // httpbin 镜像
  backup2: 'https://postman-echo.com/get', // Postman 官方测试服务
};

// ─────────────────────────────────────────
// 请求参数
// ─────────────────────────────────────────
const PARAMS = {
  headers: {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
    // 标识请求来源，避免被当成恶意流量
    'User-Agent':   'k6-load-test/1.0',
  },
  // 单次请求超时时间
  timeout: '10s',
  // 跟随重定向
  redirects: 10,
};

// ─────────────────────────────────────────
// 主测试函数
// ─────────────────────────────────────────
export default function () {

  group('GET httpbin', function () {

    // ── 发起请求 ──────────────────────────
    const res = http.get(TARGETS.primary, PARAMS);

    // ── 调试信息（仅 VU 1 第 1 次迭代打印，避免日志刷屏）──
    if (__VU === 1 && __ITER === 0) {
      console.log(`[DEBUG] Status   : ${res.status}`);
      console.log(`[DEBUG] URL      : ${res.url}`);
      console.log(`[DEBUG] Duration : ${res.timings.duration.toFixed(2)} ms`);
      console.log(`[DEBUG] Body     : ${res.body ? res.body.substring(0, 200) : '(empty)'}`);
    }

    // ── 记录自定义指标 ────────────────────
    getContactsDuration.add(res.timings.duration);

    const isOK = res.status === 200;
    RateContentOK.add(isOK);

    if (!isOK) {
      ErrorCount.add(1);
    }

    // ── 断言检查 ──────────────────────────
    const passed = check(res, {

      // 状态码必须是 200
      'GET - Status 200': (r) => r.status === 200,

      // 响应时间 < 2000ms（公共接口适当放宽）
      'GET - Duration < 2000ms': (r) => r.timings.duration < 2000,

      // 响应体不能为空
      'GET - Body not empty': (r) => r.body !== null && r.body.length > 0,

      // 响应体包含 url 字段（httpbin 标准响应）
      'GET - Body contains url': (r) => {
        try {
          const json = JSON.parse(r.body);
          return json.url !== undefined;
        } catch {
          return false;
        }
      },

      // Content-Type 必须是 JSON
      'GET - Content-Type is JSON': (r) =>
        (r.headers['Content-Type'] || '').includes('application/json'),

    });

    // ── 失败时打印详情，便于排查 ──────────
    if (!passed) {
      console.warn(
        `[WARN] VU=${__VU} ITER=${__ITER} ` +
        `status=${res.status} ` +
        `duration=${res.timings.duration.toFixed(2)}ms ` +
        `url=${res.url}`
      );
    }

  });

  sleep(1);
}

// ─────────────────────────────────────────
// 生成报告
// ─────────────────────────────────────────
export function handleSummary(data) {

  // 提取关键数据，方便 CI 日志快速查看
  const failRate   = data.metrics.http_req_failed?.values?.rate  ?? 'N/A';
  const p95        = data.metrics.get_contacts?.values?.['p(95)'] ?? 'N/A';
  const contentOK  = data.metrics.content_OK?.values?.rate       ?? 'N/A';
  const totalReqs  = data.metrics.http_reqs?.values?.count        ?? 'N/A';

  console.log('');
  console.log('════════════════════════════════════════');
  console.log('           📊 测试结果摘要               ');
  console.log('════════════════════════════════════════');
  console.log(`  总请求数     : ${totalReqs}`);
  console.log(`  失败率       : ${(failRate  * 100).toFixed(2)} %  (阈值 < 10%)`);
  console.log(`  内容正确率   : ${(contentOK * 100).toFixed(2)} %  (阈值 > 90%)`);
  console.log(`  P95 响应时间 : ${typeof p95 === 'number' ? p95.toFixed(2) + ' ms' : p95}  (阈值 < 2000ms)`);
  console.log('════════════════════════════════════════');
  console.log('');

  return {
    'result.html':  htmlReport(data),
    'summary.json': JSON.stringify(data, null, 2),
    stdout:         textSummary(data, { indent: ' ', enableColors: true }),
  };
}
