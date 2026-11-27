import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let vite, profiles, orders, guest, cache, auth, reviews;
const original={fetch:globalThis.fetch,storage:globalThis.localStorage,window:globalThis.window};
let token='session-A'; const events=new EventTarget();
before(async()=>{
  process.env.VITE_API_BASE_URL = "";
  globalThis.localStorage={getItem:key=>key==='accessToken'?token:null,removeItem:key=>{if(key==='accessToken')token=null;}};
  globalThis.window=events;
  vite=await createServer({server:{middlewareMode:true}});
  profiles=await vite.ssrLoadModule('/src/services/userService.ts');
  auth=await vite.ssrLoadModule('/src/services/authService.ts');
  orders=await vite.ssrLoadModule('/src/services/orderService.ts');
  reviews=await vite.ssrLoadModule('/src/services/reviewService.ts');
  guest=await vite.ssrLoadModule('/src/utils/guestCart.ts');
  cache=await vite.ssrLoadModule('/src/services/queryCache.ts');
});
afterEach(()=>{cache.queryClient.clear();globalThis.fetch=original.fetch;token='session-A';});
after(async()=>{await vite?.close();globalThis.fetch=original.fetch;globalThis.localStorage=original.storage;globalThis.window=original.window;});

test('purchased review validates rating, comment and images before making a request', async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({});};
  const valid={rating:5,comment:'Sản phẩm dùng tốt.',images:[]};
  for(const change of [{rating:0},{rating:6},{rating:1.5},{comment:'   '},{comment:'a'.repeat(501)},
    {images:[new File(['bad'],'test.svg',{type:'image/svg+xml'})]},
    {images:[new File([],'empty.png',{type:'image/png'})]},
    {images:[new File([new Uint8Array(5*1024*1024+1)],'large.png',{type:'image/png'})]},
    {images:Array.from({length:6},()=>new File(['image'],'test.png',{type:'image/png'}))}]) {
    await assert.rejects(reviews.createProductReview(12,{...valid,...change}));
  }
  assert.equal(calls,0);
});

test('purchased review sends authenticated JSON or multipart to the selected product',async()=>{
  const calls=[];globalThis.fetch=async(path,options)=>{calls.push({path,options});return Response.json({reviewID:3,productID:12,rating:4,comment:'Dùng tốt'});};
  await reviews.createProductReview(12,{rating:4,comment:'Dùng tốt',images:[]});
  assert.equal(calls[0].path,'/api/products/12/reviews');assert.equal(calls[0].options.method,'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body),{rating:4,comment:'Dùng tốt'});
  assert.equal(new Headers(calls[0].options.headers).get('Authorization'),'Bearer session-A');
  const image=new File(['image'],'review.png',{type:'image/png'});
  await reviews.createProductReview(12,{rating:5,comment:'Có ảnh thật',images:[image]});
  assert.ok(calls[1].options.body instanceof FormData);
  assert.deepEqual(JSON.parse(await calls[1].options.body.get('review').text()),{rating:5,comment:'Có ảnh thật'});
  assert.equal(calls[1].options.body.getAll('images')[0].name,'review.png');
  assert.equal(new Headers(calls[1].options.headers).has('Content-Type'),false);
});

test('purchased review does not turn forbidden or duplicate responses into success',async()=>{
  for(const status of [403,409]) {
    globalThis.fetch=async()=>Response.json({message:'private diagnostic'},{status});
    await assert.rejects(reviews.createProductReview(12,{rating:5,comment:'Đánh giá thực tế',images:[]}),error=>error.status===status&&!error.message.includes('private diagnostic'));
  }
});
test('profile reads the authenticated self endpoint and saves only the submitted profile contract',async()=>{
  const body={email:'self@example.test',fullName:'Customer',phoneNumber:'0900000000',address:'Address'},calls=[];
  globalThis.fetch=async(path,options)=>{calls.push({path,options});return Response.json({userID:3,...body});};
  assert.equal((await profiles.getMyProfile()).userID,3);
  const updated=await profiles.updateMyProfile(body);
  assert.equal(updated.email,body.email);assert.ok(calls.every(c=>c.path==='/api/users/me'));
  assert.equal(new Headers(calls[0].options.headers).get('Authorization'),'Bearer session-A');
  assert.equal(calls[1].options.method,'PUT');assert.deepEqual(JSON.parse(calls[1].options.body),body);
});
test('order history sends page, size, search and status to backend; summary never downloads the legacy list',async()=>{
  const calls=[];globalThis.fetch=async(path)=>{calls.push(path);return Response.json({content:[],totalElements:30,totalPages:8,statusCounts:{SHIPPED:3}});};
  const result=await orders.getMyOrderHistory({page:2,size:4,search:'but gel',status:'SHIPPED'});
  const url=new URL(calls[0],'http://test');assert.equal(url.searchParams.get('page'),'2');assert.equal(url.searchParams.get('size'),'4');
  assert.equal(url.searchParams.get('search'),'but gel');assert.equal(url.searchParams.get('status'),'SHIPPED');assert.equal(result.totalElements,30);
  await orders.getMyOrderHistory({summary:true});assert.equal(new URL(calls[1],'http://test').searchParams.get('summary'),'true');
});
test('late self-profile read from another session is rejected without clearing the new login',async()=>{
  globalThis.fetch=async()=>{token='session-B';return Response.json({fullName:'old private profile'});};
  await assert.rejects(profiles.getMyProfile(),{name:'AbortError'});assert.equal(token,'session-B');
});
test('expired session is cleared and profile cannot be reused as a successful response',async()=>{
  globalThis.fetch=async()=>Response.json({}, {status:401});
  await assert.rejects(profiles.getMyProfile(),error=>error.status===401);assert.equal(token,null);
});
test('malformed guest cart storage cannot break the shared header',()=>{
  const saved=globalThis.localStorage;
  for(const value of ['{}','null','invalid','[{"variantID":1,"quantity":-1}]']) {
    globalThis.localStorage={getItem:()=>value};assert.deepEqual(guest.getGuestCart(),[]);
  }
  globalThis.localStorage=saved;
});
test('session changes while decoding response bodies cannot return old private data',async()=>{
  const response=()=>({ok:true,status:200,json:async()=>{token='session-B';return {fullName:'Old private profile'};}});
  globalThis.fetch=async()=>response();
  await assert.rejects(profiles.getMyProfile(),{name:'AbortError'});
  token='session-A';cache.sessionScope();
  await assert.rejects(auth.getCurrentUser('http://test'),{name:'AbortError'});
  assert.equal(token,'session-B');
});
test('a late 401 cannot log out a newly established session even if its token string is reused',async()=>{
  globalThis.fetch=async()=>{
    token=null;cache.sessionScope();token='session-A';cache.sessionScope();
    return Response.json({}, {status:401});
  };
  await assert.rejects(profiles.getMyProfile(),error=>error.name==='AbortError');
  assert.equal(token,'session-A');
});

test('password changes use the authenticated API contract, accept 204 and clear expired sessions', async()=>{
  let call;
  globalThis.fetch=async(path,options)=>{call={path,options};return new Response(null,{status:204});};
  await profiles.changeMyPassword('fixture-old-password','fixture-new-password');
  assert.equal(call.path,'/api/users/me/password');assert.equal(call.options.method,'PUT');
  assert.deepEqual(JSON.parse(call.options.body),{oldPassword:'fixture-old-password',newPassword:'fixture-new-password'});
  assert.equal(new Headers(call.options.headers).get('Authorization'),'Bearer session-A');
  assert.ok(call.options.signal instanceof AbortSignal);
  globalThis.fetch=async()=>Response.json({}, {status:401});
  await assert.rejects(profiles.changeMyPassword('fixture-old','fixture-new'),error=>error.status===401);
  assert.equal(token,null);
});

test('transient identity failures reject without clearing the current login or caching anonymous success', async()=>{
  globalThis.fetch=async()=>Response.json({detail:'private database diagnostic'}, {status:503});
  await assert.rejects(auth.getCurrentUser('http://test'),error=>error.status===503&&!error.message.includes('database'));
  assert.equal(token,'session-A');
});

test('review editing preserves images with JSON and sends explicit removals and additions as multipart', async()=>{
  const calls=[];globalThis.fetch=async(path,options)=>{calls.push({path,options});return Response.json({reviewID:8,rating:4,comment:'Updated'});};
  await reviews.updateProductReview(8,{rating:4,comment:'Updated',images:[]},[]);
  assert.equal(calls[0].path,'/api/reviews/8');assert.equal(calls[0].options.method,'PUT');
  assert.deepEqual(JSON.parse(calls[0].options.body),{rating:4,comment:'Updated'});
  await reviews.updateProductReview(8,{rating:5,comment:'With replacement',images:[new File(['fixture'],'replacement.png',{type:'image/png'})]},[0,2]);
  const body=calls[1].options.body;
  assert.ok(body instanceof FormData);assert.deepEqual(JSON.parse(await body.get('removeImagePositions').text()),[0,2]);
  assert.equal(body.getAll('images')[0].name,'replacement.png');
  assert.equal(new Headers(calls[1].options.headers).has('Content-Type'),false);
  assert.equal(new Headers(calls[1].options.headers).get('Authorization'),'Bearer session-A');
});
