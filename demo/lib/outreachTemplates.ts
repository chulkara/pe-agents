// Original acquisition correspondence. The Vault career guide informed structure,
// specificity and proofreading; its job-application examples are not seller templates.
export const outreachTemplateVersion='formal-acquisition-v1';
export const outreachTemplates=[
 {id:'acquisition-inquiry',label:'Direct acquisition inquiry',description:'State your acquisition interest directly when contacting the owner or an authorised representative.'},
 {id:'owner-introduction',label:'Request an owner introduction',description:'Ask a general business contact to direct your acquisition inquiry to the appropriate person.'},
] as const;
export type OutreachTemplateId=typeof outreachTemplates[number]['id'];
export type OutreachPreparation={templateId:OutreachTemplateId;senderName:string;addressee:string;rationale:string;factId:string;channel:'Email'|'Letter'};
export function hasOutreachPlaceholders(text:string){return /\{\{[^}]+\}\}|\[(?:insert\b|your\b|owner\b|recipient\b|sender\b|company\b|firm\b|name\b|specific\b|reason\b)[^\]]*\]/i.test(text);}
function line(value:string,label:string){const clean=value.trim();if(!clean||clean.length>180||/[\r\n]/.test(clean)||hasOutreachPlaceholders(clean))throw Error(`Record a complete ${label} on one line.`);return clean;}
export function composeAcquisitionOutreach(input:{templateId:OutreachTemplateId;senderName:string;firmName:string;companyName:string;addressee:string;rationale:string}){
 if(!outreachTemplates.some(t=>t.id===input.templateId))throw Error('Choose an acquisition correspondence template.');
 const sender=line(input.senderName,'sender name'),firm=line(input.firmName,'firm name'),company=line(input.companyName,'company name'),addressee=line(input.addressee,'salutation');
 if(sender.includes('@'))throw Error('Use the sender’s name rather than an email address.');
 const rationale=input.rationale.trim();
 if(rationale.length<20||rationale.length>500||hasOutreachPlaceholders(rationale))throw Error('Write a specific reason for this inquiry, supported by the selected source, between 20 and 500 characters.');
 const purpose=input.templateId==='acquisition-inquiry'
  ?`I am ${sender}, writing on behalf of ${firm}. I would like to discuss a potential acquisition of ${company}.`
  :`I am ${sender}, writing on behalf of ${firm} regarding a potential acquisition of ${company}. Could you please direct this inquiry to the owner or the person responsible for considering acquisition proposals?`;
 const request=input.templateId==='acquisition-inquiry'
  ?'Would you be available for a 15-minute introductory telephone call? If another person is responsible for these discussions, I would appreciate being directed to them.'
  :'I would welcome a 15-minute introductory telephone call with the appropriate person to explain our interest and understand whether a discussion would be relevant.';
 return {subject:`${input.templateId==='acquisition-inquiry'?'Acquisition inquiry':'Owner introduction request'}: ${company}`,body:`Dear ${addressee},\n\n${purpose}\n\n${rationale}\n\n${request}\n\nYours sincerely,\n${sender}\n${firm}`};
}
