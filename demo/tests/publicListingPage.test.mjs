import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudBrokerStore} from '../lib/brokerCloud.ts';

// A signed-out visitor opens a public listing page. The questions table refuses anonymous
// reads, and that refusal must not break the page: no query is sent and the list is empty.
test('anonymous questions resolve to an empty list without querying the refused table',async()=>{
  let queried=false;
  const client={
    auth:{getSession:async()=>({data:{session:null}})},
    from(){queried=true;throw Error('The questions table must not be queried without a session.');},
    rpc(){throw Error('No RPC expected.');},
    storage:{from(){throw Error('No storage expected.');}},
  };
  const store=cloudBrokerStore(client,'');
  assert.deepEqual(await store.questions(),[]);
  assert.deepEqual(await store.questions('some-listing'),[]);
  assert.equal(queried,false);
});

test('a signed-in session still reaches the questions table',async()=>{
  const rows=[];let filtered='';
  // A thenable query builder, like the real client: select/order/eq chain, then awaiting resolves rows.
  const q={select(){return q;},order(){return q;},eq(_c,v){filtered=v;return q;},then(resolve){resolve({data:rows,error:null});}};
  const client={
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}})},
    from(table){assert.equal(table,'kalling_listing_questions');return q;},
  };
  const store=cloudBrokerStore(client,'');
  assert.deepEqual(await store.questions('l-1'),[]);
  assert.equal(filtered,'l-1');
});
