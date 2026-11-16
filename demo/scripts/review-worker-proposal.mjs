// Read-only model review: normal advisor Auth, current permissions and logged original-file reads.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deployedCloudProject} from '../lib/cloudProject.ts';
import {cloudAgentBackend} from '../lib/agentJobs.ts';
import {cloudExecutionStore} from '../lib/executionStore.ts';
import {emptyBrokerDb} from '../lib/brokerage.ts';
import {executionPacketCurrent,validateExecutionOutput} from '../lib/executionDrafting.ts';
import {fictionalEmails,readHiddenPassword} from './hosted-validation.mjs';
import {validateWorkerContext,makeHostedClient,ownerLogin,verifyContext,row} from './hosted-worker.mjs';

const ok=(v,m)=>{if(!v)throw Error(m);},hash=b=>createHash('sha256').update(b).digest('hex');
export async function exportWorkerReview(config,account,foundation,handover,report,folder,{makeClient=makeHostedClient}={}){
  const context=validateWorkerContext(foundation,handover),m=report?.fixtureManifest;
  ok(report?.project===config.url&&['mac-worker','persistent-worker'].includes(report.mode)&&m?.firm===context.firm&&m.transaction===context.transaction&&m.assignment&&m.job&&m.proposal?.status==='Pending human review','Use the completed report for this fictional proposal.');
  const c=makeClient(config);let created=false;
  try{
    const user=await ownerLogin(c,account),bundle=await verifyContext(c,context,user),store=cloudExecutionStore(c),packets=await store.packets(context.transaction),packet=packets.find(p=>p.id===m.assignment),job=await row(c,'kalling_agent_jobs',m.job);
    ok(packet&&job.firm_id===context.firm&&job.company_id===context.company&&job.assignment_id===packet.id&&job.status==='succeeded','The exact saved model proposal is unavailable.');
    const r=(await cloudAgentBackend(c,context.firm).jobs([packet.id]))[0]?.result;
    ok(r?.id===packet.id&&r.inputHash===packet.inputHash&&r.proposalOnly===true&&r.executionPolicy==='local-only-required-v2','The hosted result does not match this reviewed input.');
    const proposal=validateExecutionOutput({claims:r.claims.map(x=>({sourceId:x.sourceId,quote:x.quote})),questions:r.questions},packet);
    ok(executionPacketCurrent({...emptyBrokerDb(),executionFiles:bundle.files,transactions:[bundle.transaction]},bundle.transaction,packet),'This proposal is stale. The transaction or its source document changed; prepare a fresh proposal.');
    await mkdir(resolve(folder),{mode:0o700});created=true;
    const lines=['Kalling | Fictional proposal review','Status: Pending human review','',
      'This export does not approve a claim, change a deal record or send a message.',
      'Compare the input passage and proposed quotation with the original PDF. A quote matching the input alone does not prove that the input faithfully represents the document.',
      'Then decide whether each proposed question is relevant and useful. Record any approved action separately in the workspace.','',
      'Purpose: '+packet.data.purpose,'Job: '+m.job,'Transaction revision: '+packet.data.revision,''];
    const seen=new Map();for(const passage of packet.data.passages){const id=passage.source.fileId;
      if(!seen.has(id)){const blob=await store.openFile(id),bytes=Buffer.from(await blob.arrayBuffer());ok(bytes.subarray(0,5).toString()==='%PDF-'&&hash(bytes)===passage.sha256,'The original file bytes do not match the packet. No review export was completed.');const name='source-'+(seen.size+1)+'.pdf';await writeFile(join(folder,name),bytes,{mode:0o600,flag:'wx'});seen.set(id,name);}
      lines.push('SOURCE '+passage.id+' | '+seen.get(id)+' | page '+passage.source.page,'Permitted input passage:',passage.source.excerpt,'');
    }
    lines.push('PROPOSED QUOTATIONS');for(const claim of proposal.claims)lines.push(claim.sourceId+', page '+claim.source.page+': '+JSON.stringify(claim.quote));
    lines.push('','PROPOSED QUESTIONS');proposal.questions.forEach((q,i)=>lines.push((i+1)+'. '+q));
    const current=(await store.list()).find(b=>b.transaction.id===context.transaction);ok(current&&executionPacketCurrent({...emptyBrokerDb(),executionFiles:current.files,transactions:[current.transaction]},current.transaction,packet),'The transaction or permissions changed during review. Try again with a current proposal.');
    await writeFile(join(folder,'review.txt'),lines.join('\n')+'\n',{mode:0o600,flag:'wx'});
    return {folder:resolve(folder),files:['review.txt',...seen.values()],proposalStatus:'Pending human review',modelRequests:0};
  }catch(e){if(created)await rm(resolve(folder),{recursive:true,force:true});throw e;}
  finally{const out=await c.auth.signOut({scope:'global'});delete account.password;ok(!out.error,'The fictional owner session could not sign out.');}
}

async function main(){
  const args=process.argv.slice(2),arg=n=>args[args.indexOf(n)+1];
  try{
    ok(args.includes('--confirm-fictional')&&args.includes('--prompt')&&['--foundation-report','--handover-report','--worker-report','--folder'].every(n=>args.includes(n)),'Use --confirm-fictional --prompt --foundation-report PATH --handover-report PATH --worker-report PATH --folder NEW_FOLDER.');
    const read=async n=>JSON.parse(await readFile(resolve(arg(n)),'utf8')),foundation=await read('--foundation-report'),handover=await read('--handover-report'),report=await read('--worker-report');validateWorkerContext(foundation,handover);
    const account={email:fictionalEmails.owner_a,password:await readHiddenPassword('Password for '+fictionalEmails.owner_a+': ')};
    const out=await exportWorkerReview(deployedCloudProject,account,foundation,handover,report,resolve(arg('--folder')));console.log('Ready for your review: '+join(out.folder,'review.txt')+'\nOriginal PDFs: '+out.folder+'\nNothing was approved or sent. No model request was made.');
  }catch(e){console.error('BLOCKED: '+String(e.message||e));process.exitCode=1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
