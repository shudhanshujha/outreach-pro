const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://usycsxknizcjbuftuzqr.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_ftNO2ex_Yhp3YuLV8AvAWQ_QMtbIxeb';



const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Supabase client initialized');

module.exports = supabase;
