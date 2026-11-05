import {generateKeyPairSync,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import type {Proxy} from '../src/parse.ts';
export const uuid='00000000-0000-4000-8000-000000000001';
export const fake='FAKE_TEST_PASSWORD_NOT_A_REAL_CREDENTIAL';
const key=()=>randomBytes(32).toString('base64');
const ec=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const sec1=ec.privateKey.export({type:'sec1',format:'der'}).toString('base64');
const spki=ec.publicKey.export({type:'spki',format:'der'}).toString('base64');
export const native:Proxy[]=[
  {type:'ss',cipher:'aes-128-gcm',password:fake},
  {type:'ssr',cipher:'aes-128-cfb',password:fake,protocol:'origin',obfs:'plain'},
  {type:'vmess',uuid,alterId:0,cipher:'auto'},
  {type:'vless',uuid,network:'tcp',tls:true,servername:'example.com','client-fingerprint':'chrome',flow:'xtls-rprx-vision','reality-opts':{'public-key':key().replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'),'short-id':'0123456789abcdef'},'packet-encoding':'xudp'},
  {type:'trojan',password:fake,sni:'example.com'},
  {type:'http',username:'fake',password:fake,tls:false},
  {name:'HTTPS',type:'http',username:'fake',password:fake,tls:true,sni:'example.com'},
  {type:'socks5',username:'fake',password:fake,udp:true},
  {type:'snell',psk:fake,version:3},
  {type:'ssh',username:'fake',password:fake},
  {type:'wireguard','private-key':key(),'public-key':key(),ip:'10.11.12.13',udp:true},
  {type:'hysteria','auth-str':fake,sni:'example.com',alpn:['hysteria'],up:'10 Mbps',down:'50 Mbps',ports:'443,8443','hop-interval':10,obfs:fake,protocol:'udp','recv-window-conn':16777216,'recv-window':4194304},
  {type:'hysteria2',password:fake,sni:'example.com',alpn:['h3'],up:'10 Mbps',down:'50 Mbps',obfs:'salamander','obfs-password':fake,ports:'443,8443','hop-interval':'10','initial-stream-receive-window':4194304,'max-stream-receive-window':8388608},
  {name:'TUIC4',type:'tuic',token:fake,'congestion-controller':'cubic','udp-relay-mode':'native',sni:'example.com',alpn:['h3']},
  {name:'TUIC5',type:'tuic',uuid,password:fake,'congestion-controller':'bbr','udp-relay-mode':'quic',sni:'example.com',alpn:['h3'],'disable-sni':false},
  {type:'anytls',password:fake,sni:'example.com','client-fingerprint':'chrome','idle-session-timeout':30},
  {type:'mieru',username:'fake',password:fake,transport:'TCP',multiplexing:'MULTIPLEXING_LOW'},
  {type:'shadowquic',username:'fake',password:fake,sni:'example.com',alpn:['h3'],'quic-versions':['v1']},
  {type:'masque','private-key':sec1,'public-key':spki,ip:'10.11.12.13',udp:true},
  {type:'sudoku',key:uuid,'aead-method':'chacha20-poly1305','padding-min':2,'padding-max':7,'table-type':'prefer_ascii'},
  {type:'trusttunnel',username:'fake',password:fake,sni:'example.com'},
  {type:'gost-relay',username:'fake',password:fake,udp:true},
  {type:'tailscale',hostname:'fake-test',ephemeral:true,'control-url':'https://example.invalid','state-dir':'./fake-tailscale-state'},
  {type:'zerotier',network:'0123456789abcdef','state-dir':'./fake-zerotier-state'},
  {type:'easytier','network-name':'FAKE_TEST_NETWORK','network-secret':fake,peers:['tcp://192.0.2.10:11010'],'state-dir':'./fake-easytier-state'},
  {type:'openvpn',proto:'udp',username:'fake',password:fake,ca:fs.readFileSync(new URL('./fake-ca.pem',import.meta.url),'utf8')},
  {type:'direct'},{type:'dns'},{type:'reject'},{type:'rematch','target-rematch-name':'fixture-rematch'},
].map((x,i)=>({server:'example.com',port:443,name:x.name||'native-'+x.type+'-'+i,...x})) as Proxy[];
export const uriCases=[
  'ss://'+Buffer.from('aes-128-gcm:'+fake).toString('base64url')+'@example.com:443#SS',
  'ssr://'+Buffer.from('example.com:443:origin:aes-128-cfb:plain:'+Buffer.from(fake).toString('base64url')+'/?remarks='+Buffer.from('SSR').toString('base64url')).toString('base64url'),
  'vmess://'+Buffer.from(JSON.stringify({v:'2',ps:'VMess',add:'example.com',port:'443',id:uuid,aid:'0',scy:'auto',net:'ws',host:'example.com',path:'/fake',tls:'tls',sni:'example.com',fp:'chrome',alpn:'h2,http/1.1'})).toString('base64'),
  ...['tcp','ws','grpc','h2','httpupgrade','xhttp'].map(n=>'vless://'+uuid+'@example.com:443?security=tls&type='+n+'&host=example.com&path=%2Ffake&serviceName=fake&alpn=h2&fp=chrome#VLESS-'+n),
  'vless://'+uuid+'@example.com:443?security=reality&type=tcp&flow=xtls-rprx-vision&pbk='+native.find(p=>p.type==='vless')!['reality-opts']['public-key']+'&sid=0123456789abcdef&sni=example.com&fp=chrome&packetEncoding=xudp#Reality',
  'trojan://'+fake+'@example.com:443?sni=example.com&type=ws&host=example.com&path=%2Ftest#Trojan',
  'hysteria://example.com:443?auth='+fake+'&upmbps=10&downmbps=50&peer=example.com&alpn=hysteria&protocol=udp&obfs=FAKE#HY1',
  'hy2://'+fake+'@example.com:443,8443?sni=example.com&alpn=h3&obfs=salamander&obfs-password=FAKE&hop-interval=10s#HY2',
  'tuic://'+fake+'@example.com:443?sni=example.com&congestion_control=cubic&udp_relay_mode=native&alpn=h3#TUIC4',
  'tuic://'+uuid+':'+fake+'@example.com:443?sni=example.com&congestion_control=bbr&udp_relay_mode=quic&alpn=h3#TUIC5',
  'anytls://'+fake+'@example.com:443?sni=example.com&fp=chrome#AnyTLS',
  'https://fake:'+fake+'@example.com:443#HTTPS',
  'http://fake:'+fake+'@example.com:8080#HTTP',
  'socks5://fake:'+fake+'@example.com:1080#SOCKS',
  'ssh://fake:'+fake+'@example.com:22#SSH',
  'snell://'+fake+'@example.com:443?version=3#Snell',
  'wireguard://'+encodeURIComponent(key())+'@example.com:443?publickey='+encodeURIComponent(key())+'&address=10.11.12.13#WG'
  ,'mierus://fake:'+fake+'@example.com?port=2999&protocol=TCP&port=3000-3009&protocol=UDP&multiplexing=MULTIPLEXING_LOW#Mieru'
];
