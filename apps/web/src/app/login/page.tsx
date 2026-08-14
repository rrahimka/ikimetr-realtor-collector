import { LoginForm } from '../../components/login-form';import { getLang } from '../../lib/lang';
export default async function Login(){const lang=await getLang();return <LoginForm lang={lang}/>}
