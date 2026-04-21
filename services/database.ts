import { supabase, USE_MOCK } from './supabase';
import { CHURCH_MAPPING } from '../constants';

// Cache for mapping cents_code to database ID
let churchIdMap: Map<number, number> | null = null;

/**
 * Get mapping of cents_code to database ID
 */
export const getChurchIdMap = async (): Promise<Map<number, number>> => {
  if (churchIdMap) {
    return churchIdMap;
  }

  if (USE_MOCK) {
    churchIdMap = new Map<number, number>();
    Object.keys(CHURCH_MAPPING).forEach((cents) => {
      const code = parseInt(cents, 10);
      // In mock mode we use cents_code as the "database id".
      churchIdMap!.set(code, code);
    });
    console.log(`✓ Loaded mock church map with ${churchIdMap.size} entries`);
    return churchIdMap;
  }

  try {
    const { data, error } = await supabase
      .from('churches')
      .select('id, cents_code');

    if (error) {
      console.error('Error fetching church map:', error);
      throw error;
    }

    churchIdMap = new Map();
    data?.forEach(church => {
      churchIdMap!.set(church.cents_code, church.id);
    });

    console.log(`✓ Loaded church map with ${churchIdMap.size} entries`);
    return churchIdMap;
  } catch (error) {
    console.error('Failed to load church ID map:', error);
    throw error;
  }
};

/**
 * Initialize the database with churches
 * This should be called once on first load
 */
export const initializeDatabase = async () => {
  if (USE_MOCK) {
    console.log('🧪 Mock mode enabled: skipping Supabase database initialization');
    return true;
  }

  try {
    console.log('🔄 Checking if churches table is populated...');
    
    // Check if churches table has data
    const { count, error: countError } = await supabase
      .from('churches')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error checking churches:', countError);
      const extraHint = /Failed to fetch|ERR_NAME_NOT_RESOLVED/i.test(countError.message)
        ? ' (Cannot reach Supabase: check internet/DNS or set VITE_USE_MOCK=true)'
        : '';
      throw new Error(`Failed to check churches table: ${countError.message}${extraHint}`);
    }

    console.log(`✓ Churches count: ${count}`);
    
    if (count && count > 0) {
      console.log(`✅ Churches already populated: ${count} churches`);
      return true;
    }

    console.log('Churches table is empty, seeding...');

    // Prepare churches data from mapping (don't include id - let PostgreSQL auto-increment)
    const churches = Object.entries(CHURCH_MAPPING).map(([cents, name]) => ({
      name,
      cents_code: parseInt(cents, 10),
    }));

    console.log(`📊 Prepared ${churches.length} churches for insertion`);

    // Insert churches in batches (Supabase has limits)
    const batchSize = 50;
    for (let i = 0; i < churches.length; i += batchSize) {
      const batch = churches.slice(i, i + batchSize);
      console.log(`📤 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(churches.length / batchSize)}: Inserting ${batch.length} churches...`);
      
      const { error, data } = await supabase
        .from('churches')
        .insert(batch)
        .select();

      if (error) {
        console.error(`❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error);
        throw new Error(`Failed to insert churches batch: ${error.message}`);
      }
      
      const insertedIds = data?.map(c => c.id).join(', ') || '?';
      console.log(`✓ Inserted IDs: ${insertedIds}`);
    }

    console.log('✅ Database initialization completed successfully!');

    console.log('✅ Database initialization completed successfully!');
    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  }
};
