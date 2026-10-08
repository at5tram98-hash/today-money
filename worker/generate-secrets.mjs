import webpush from 'web-push';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const {publicKey,privateKey}=webpush.generateVAPIDKeys();
writeFileSync(new URL('./.dev.vars',import.meta.url),`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\nPAIRING_SECRET=${randomBytes(32).toString('hex')}\n`,{mode:0o600,flag:'wx'});
console.log('Created worker/.dev.vars (private; ignored by Git). Upload secrets through Wrangler, never commit this file.');
