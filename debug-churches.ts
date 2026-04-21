/**
 * Debug script to check if churches are properly initialized in Supabase
 * Run with: npx ts-node debug-churches.ts
 */

import { supabase } from './services/supabase';

async function debugChurches() {
  console.log('🔍 Checking churches in Supabase...\n');

  try {
    // Get total count
    const { count, error: countError } = await supabase
      .from('churches')
      .select('id', { count: 'exact' });

    if (countError) {
      console.error('❌ Error counting churches:', countError);
      return;
    }

    console.log(`📊 Total churches in database: ${count}\n`);

    // Get first 5
    const { data, error } = await supabase
      .from('churches')
      .select('id, name, cents_code')
      .order('id', { ascending: true })
      .limit(5);

    if (error) {
      console.error('❌ Error fetching churches:', error);
      return;
    }

    console.log('📋 First 5 churches:');
    data?.forEach(church => {
      console.log(`  - ID: ${church.id}, Cents: ${church.cents_code}, Name: ${church.name}`);
    });

    // Check if cent 0 and 1 exist (critical ones)
    const { data: churchZero } = await supabase
      .from('churches')
      .select('id, cents_code')
      .eq('cents_code', 0)
      .single();

    const { data: churchOne } = await supabase
      .from('churches')
      .select('id, cents_code')
      .eq('cents_code', 1)
      .single();

    console.log(`\n✓ Church with cents_code 0 (default): ID = ${churchZero?.id}`);
    console.log(`✓ Church with cents_code 1 (central): ID = ${churchOne?.id}`);

    // Check for RLS policies
    console.log('\n🔐 Checking RLS policies...');
    const { data: policies, error: policiesError } = await supabase
      .from('churches')
      .select('*')
      .limit(1);

    if (policiesError) {
      console.warn('⚠️ RLS Policy might be blocking read: ', policiesError.message);
    } else {
      console.log('✓ RLS allows reading churches');
    }

    console.log('\n✅ Debug complete!');
  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
}

debugChurches();
