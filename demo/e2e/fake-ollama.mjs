// Local stand-in for Ollama on 127.0.0.1:11434 for browser tests. Not for real use.
import {createServer} from 'node:http';
import {scriptedReply} from './fake-model.mjs';
const delay=Number(process.env.FAKE_DELAY||150);
createServer(async(req,res)=>{let b='';for await(const c of req)b+=c;const body=b?JSON.parse(b):{};const send=(o,s=200)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(o));};
  if(req.url==='/api/status')return send({cloud:{disabled:true,source:'config'}});
  if(req.url==='/api/tags')return send({models:['qwen3:4b','qwen3:8b','qwen3:14b'].map(name=>({name,size:2500000000,digest:'a'.repeat(64)}))});
  if(req.url==='/api/show')return send({modelfile:'FROM /local/weights'});
  await new Promise(r=>setTimeout(r,delay));const r=scriptedReply(body);return r?send(r):send({error:'unexpected prompt'},400);
}).listen(Number(process.env.FAKE_PORT||11434),'127.0.0.1',()=>console.log('fake ollama ready'));
