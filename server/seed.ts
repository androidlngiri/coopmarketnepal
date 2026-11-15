import crypto from 'crypto';
import { db, initSchema } from './db.ts';
import { hashPassword } from './auth.ts';

export function seedDatabase() {
  initSchema();

  const planCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM subscription_plans`).get() as { cnt: number }).cnt;
  if (planCount === 0) {
    const insertPlan = db.prepare(`
      INSERT INTO subscription_plans (
        id, code, name_ne, name_en, description_ne, description_en,
        monthly_price_npr, annual_price_npr, trial_days, max_products, max_staff, max_storage_mb, features_json, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const plans = [
      [
        'plan_free_trial',
        'free_trial',
        'निःशुल्क परीक्षण',
        'Free Trial',
        'नयाँ स्वीकृत सहकारीका लागि ३० दिनको पूर्ण परीक्षण योजना',
        '30-day introductory trial for newly approved cooperatives',
        0,
        0,
        30,
        15,
        2,
        200,
        JSON.stringify({ custom_domain: false, reports_export: true, promotions: false }),
        1,
      ],
      [
        'plan_basic',
        'basic',
        'आधारभूत योजना',
        'Basic',
        'स्थानीय कृषि तथा दुग्ध सहकारी संस्थाका लागि उपयुक्त',
        'Built for local agricultural and dairy cooperatives',
        999,
        9990,
        0,
        50,
        3,
        500,
        JSON.stringify({ custom_domain: false, reports_export: true, promotions: true }),
        2,
      ],
      [
        'plan_standard',
        'standard',
        'मानक योजना',
        'Standard',
        'बढ्दो सहकारी बजार, कूपन र बहु-कर्मचारी व्यवस्थापन',
        'Growing cooperative stores with coupons and staff roles',
        2499,
        24990,
        0,
        250,
        10,
        2048,
        JSON.stringify({ custom_domain: true, reports_export: true, promotions: true }),
        3,
      ],
      [
        'plan_premium',
        'premium',
        'प्रिमियम योजना',
        'Premium',
        'जिल्ला तथा प्रदेशस्तरीय बृहत् सहकारी संघहरूका लागि',
        'District & provincial cooperative unions with custom domains',
        4999,
        49990,
        0,
        1000,
        25,
        10240,
        JSON.stringify({ custom_domain: true, reports_export: true, promotions: true, priority_support: true }),
        4,
      ],
      [
        'plan_enterprise',
        'enterprise',
        'उद्यम योजना',
        'Enterprise',
        'राष्ट्रिय सहकारी महासंघ तथा असीमित व्यापार क्षमता',
        'National federations with high-volume multi-branch scale',
        9999,
        99990,
        0,
        10000,
        100,
        51200,
        JSON.stringify({ custom_domain: true, reports_export: true, promotions: true, priority_support: true, api_access: true }),
        5,
      ],
    ];

    for (const p of plans) insertPlan.run(...p);
  }

  const catCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM global_categories`).get() as { cnt: number }).cnt;
  if (catCount === 0) {
    const insertCat = db.prepare(`
      INSERT INTO global_categories (id, slug, name_ne, name_en, description_ne, description_en, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const categories = [
      ['cat_agri', 'agriculture-grains', 'कृषि तथा अन्नबाली', 'Agriculture & Grains', 'अर्गानिक सिमी, कोदो, फापर, चामल र ताजा तरकारी', 'Organic beans, millet, buckwheat, and grains', 1],
      ['cat_tea', 'tea-coffee-spices', 'चिया, कफी र मसला', 'Tea, Coffee & Spices', 'इलाम चिया, गुल्मी कफी, टिमुर र अलैंची', 'Ilam tea, highland coffee, Timur, and cardamom', 2],
      ['cat_dairy', 'dairy-ghee-honey', 'दुग्ध, घ्यू र मह', 'Dairy, Ghee & Honey', 'शुद्ध पहाडी गाईको घ्यू, पनिर र भीर मह', 'Pure mountain cow ghee, dairy, and wild honey', 3],
      ['cat_craft', 'handicraft-textiles', 'हस्तकला र ढाका कपडा', 'Handicraft & Textiles', 'पाल्पाली ढाका, अल्लो, पश्मिना र बाँसका सामग्री', 'Palpali Dhaka, Allo fiber, and bamboo crafts', 4],
      ['cat_himal', 'indigenous-himalayan', 'रैथाने तथा हिमाली उत्पादन', 'Indigenous & Himalayan', 'जुम्ली मार्सी, मुस्ताङको स्याउ र हिमाली जडीबुटी', 'Jumli Marsi, Mustang apples, and mountain herbs', 5],
      ['cat_daily', 'daily-essentials', 'दैनिक उपभोग्य वस्तु', 'Daily Essentials', 'तोरीको तेल, बेसार, अचार र घरेलु खाद्य सामग्री', 'Cold-pressed mustard oil, turmeric, and pickles', 6],
    ];
    for (const c of categories) insertCat.run(...c);
  }

  const coopCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM cooperatives`).get() as { cnt: number }).cnt;
  if (coopCount === 0) {
    // Non-guessable random password hashes for seeded showcase cooperatives
    const randomSeedHash = () => hashPassword(crypto.randomBytes(24).toString('hex'));

    const insertUser = db.prepare(`
      INSERT INTO users (id, full_name, full_name_ne, email, phone, password_hash, role, preferred_language, phone_verified_at)
      VALUES (?, ?, ?, ?, ?, ?, 'cooperative_admin', 'ne', datetime('now'))
    `);

    const seedOwners = [
      ['usr_coop_ilam', 'Bishnu Prasad Rai', 'विष्णु प्रसाद राई', 'contact@ilamtea.coop.np', '9800000101'],
      ['usr_coop_jumla', 'Dhanmaya Rokaya', 'धनमाया रोकाया', 'contact@jumlaorganics.coop.np', '9800000102'],
      ['usr_coop_palpa', 'Saraswati Thapa', 'सरस्वती थापा', 'contact@palpadhaka.coop.np', '9800000103'],
      ['usr_coop_mustang', 'Tashi Thakali', 'टासी थकाली', 'contact@mustangfruit.coop.np', '9800000104'],
      ['usr_coop_kavre', 'Ramhari Timalsina', 'रामहरि तिमल्सिना', 'contact@kavredairy.coop.np', '9800000105'],
    ];
    for (const [id, name, nameNe, email, phone] of seedOwners) {
      insertUser.run(id, name, nameNe, email, phone, randomSeedHash());
    }

    const insertCoop = db.prepare(`
      INSERT INTO cooperatives (
        id, owner_user_id, slug, name_ne, name_en, registration_number, registration_authority,
        registration_date_ad, registration_date_bs, cooperative_type, pan_vat_number,
        province, district, municipality, ward_number, tole_address,
        contact_email, contact_phone, authorized_rep_name, authorized_rep_designation,
        logo_url, requested_store_name, status, is_featured, otp_verified_at, approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `);

    insertCoop.run(
      'coop_ilam_tea',
      'usr_coop_ilam',
      'ilam-green-tea-coop',
      'इलाम हरित चिया उत्पादक सहकारी संस्था लि.',
      'Ilam Green Tea Producers Cooperative Ltd.',
      'REG-ILM-2074-089',
      'डिभिजन सहकारी कार्यालय, इलाम',
      '2017-06-14',
      '२०७४-०२-३१',
      'agriculture',
      '601245789',
      'कोशी प्रदेश',
      'इलाम',
      'सूर्योदय नगरपालिका',
      '१०',
      'फिक्कल चोक',
      'contact@ilamtea.coop.np',
      '9800000101',
      'विष्णु प्रसाद राई',
      'अध्यक्ष',
      '/images/product-ilam-tea.jpg',
      'इलाम सहकारी चिया घर',
      'approved',
      1,
      new Date().toISOString()
    );

    insertCoop.run(
      'coop_jumla_organics',
      'usr_coop_jumla',
      'jumla-himalayan-organics',
      'जुम्ला हिमाली अर्गानिक कृषि सहकारी संस्था लि.',
      'Jumla Himalayan Organic Agro Cooperative Ltd.',
      'REG-JML-2076-042',
      'चन्दननाथ नगरपालिका सहकारी शाखा',
      '2019-09-02',
      '२०७६-०५-१६',
      'agriculture',
      '604512398',
      'कर्णाली प्रदेश',
      'जुम्ला',
      'चन्दननाथ नगरपालिका',
      '५',
      'खलङ्गा बजार',
      'contact@jumlaorganics.coop.np',
      '9800000102',
      'धनमाया रोकाया',
      'प्रबन्धक',
      '/images/product-mountain-ghee.jpg',
      'जुम्ला रैथाने कोसेली घर',
      'approved',
      1,
      new Date().toISOString()
    );

    insertCoop.run(
      'coop_palpa_dhaka',
      'usr_coop_palpa',
      'palpa-dhaka-craft-coop',
      'पाल्पा महिला ढाका तथा हस्तकला सहकारी संस्था लि.',
      'Palpa Women Dhaka & Handicraft Cooperative Ltd.',
      'REG-PLP-2073-118',
      'डिभिजन सहकारी कार्यालय, पाल्पा',
      '2016-11-20',
      '२०७३-०८-०५',
      'handicraft',
      '600874125',
      'लुम्बिनी प्रदेश',
      'पाल्पा',
      'तानसेन नगरपालिका',
      '४',
      'मखनटोल',
      'contact@palpadhaka.coop.np',
      '9800000103',
      'सरस्वती थापा',
      'कोषाध्यक्ष',
      '/images/product-dhaka-shawl.jpg',
      'पाल्पाली ढाका बुनाइ पसल',
      'approved',
      1,
      new Date().toISOString()
    );

    insertCoop.run(
      'coop_mustang_honey',
      'usr_coop_mustang',
      'himalayan-beekeepers-coop',
      'अन्नपूर्ण हिमाली मौरीपालन तथा दुग्ध सहकारी लि.',
      'Annapurna Himalayan Beekeepers & Dairy Coop Ltd.',
      'REG-KAK-2075-064',
      'सहकारी रजिष्ट्रारको कार्यालय, गण्डकी',
      '2018-05-10',
      '२०७५-०१-२७',
      'dairy',
      '603981204',
      'गण्डकी प्रदेश',
      'कास्की',
      'अन्नपूर्ण गाउँपालिका',
      '६',
      'घान्द्रुक फेदी',
      'contact@mustangfruit.coop.np',
      '9800000104',
      'टासी थकाली',
      'अध्यक्ष',
      '/images/product-himalayan-honey.jpg',
      'अन्नपूर्ण मह तथा डेरी',
      'approved',
      1,
      new Date().toISOString()
    );

    // 1 pending review cooperative for Super Admin evaluation
    insertCoop.run(
      'coop_kavre_pending',
      'usr_coop_kavre',
      'kavre-fresh-dairy-coop',
      'काभ्रेपलाञ्चोक दुग्ध उत्पादक सहकारी संस्था लि.',
      'Kavrepalanchok Fresh Dairy Producers Coop Ltd.',
      'REG-KVR-2081-019',
      'पनौती नगरपालिका सहकारी विभाग',
      '2024-05-18',
      '२०८१-०२-०५',
      'dairy',
      '609887412',
      'बागमती प्रदेश',
      'काभ्रेपलाञ्चोक',
      'पनौती नगरपालिका',
      '७',
      'खोपासी मार्ग',
      'contact@kavredairy.coop.np',
      '9800000105',
      'रामहरि तिमल्सिना',
      'सचिव',
      '/images/product-mountain-ghee.jpg',
      'काभ्रे ताजा डेरी स्टोर',
      'pending_review',
      0,
      null
    );

    db.prepare(`
      INSERT INTO cooperative_documents (id, cooperative_id, document_type, file_name, file_url, file_size_bytes, verified_status)
      VALUES (?, 'coop_kavre_pending', 'registration_certificate', 'kavre-coop-reg-2081.pdf', '/images/banner-cooperative-artisan.jpg', 245120, 'pending')
    `).run('doc_kavre_1');

    // Subscriptions for approved cooperatives
    const insertSub = db.prepare(`
      INSERT INTO subscriptions (id, cooperative_id, plan_id, billing_cycle, status, starts_at, ends_at)
      VALUES (?, ?, ?, 'annual', 'active', datetime('now'), datetime('now', '+365 days'))
    `);
    insertSub.run('sub_ilam', 'coop_ilam_tea', 'plan_standard');
    insertSub.run('sub_jumla', 'coop_jumla_organics', 'plan_premium');
    insertSub.run('sub_palpa', 'coop_palpa_dhaka', 'plan_standard');
    insertSub.run('sub_mustang', 'coop_mustang_honey', 'plan_basic');

    // Stores
    const insertStore = db.prepare(`
      INSERT INTO stores (
        id, cooperative_id, store_name_ne, store_name_en, tagline_ne, tagline_en,
        theme_key, primary_color, accent_color, font_key, logo_url, banner_url,
        intro_ne, intro_en, mission_ne, mission_en, vision_ne, vision_en,
        notice_ne, notice_en, footer_text_ne, footer_text_en,
        contact_phone, contact_email, address_text, sections_json, is_published, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `);

    const defaultSections = JSON.stringify([
      { id: 'hero', type: 'hero', visible: true, title_ne: 'प्रत्यक्ष किसान उत्पादन', title_en: 'Direct From Cooperative Farmers' },
      { id: 'featured_products', type: 'featured_products', visible: true, title_ne: 'विशेष उत्पादनहरू', title_en: 'Featured Products' },
      { id: 'about', type: 'about', visible: true, title_ne: 'हाम्रो सहकारी परिचय', title_en: 'About Our Cooperative' },
      { id: 'notice', type: 'notice', visible: true, title_ne: 'सूचना तथा घोषणा', title_en: 'Notices & Announcements' },
    ]);

    insertStore.run(
      'store_ilam',
      'coop_ilam_tea',
      'इलाम सहकारी चिया घर',
      'Ilam Cooperative Tea House',
      '१,८०० मिटर उचाइको अर्गानिक अर्थोडक्स चिया',
      'High-altitude organic orthodox tea directly from Ilam farmers',
      'ilam_emerald',
      '#15803D',
      '#B91C1C',
      'noto_jakarta',
      '/images/product-ilam-tea.jpg',
      '/images/hero-nepal-cooperative.jpg',
      'सूर्योदय नगरपालिकाका २८० साना चिया किसान सदस्यहरूको साझा सहकारी उद्यम।',
      'Owned collectively by 280 smallholder tea farmers in Suryodaya, Ilam.',
      'बिचौलिया बिना किसानलाई उचित मूल्य र उपभोक्तालाई ताजा अर्गानिक चिया उपलब्ध गराउनु।',
      'Fair farm-gate pricing for farmers and single-origin organic tea for buyers.',
      'नेपाली अर्थोडक्स चियालाई विश्वस्तरीय गुणस्तरमा पुर्याउने।',
      'Elevating Nepali orthodox tea to global single-origin standards.',
      'नयाँ वसन्त फस्ट फ्लश (First Flush) चिया स्टकमा उपलब्ध छ।',
      'Fresh Spring First Flush harvest now in stock.',
      '© इलाम हरित चिया उत्पादक सहकारी संस्था लि.',
      '© Ilam Green Tea Producers Cooperative Ltd.',
      '9800000101',
      'contact@ilamtea.coop.np',
      'सूर्योदय-१०, फिक्कल, इलाम',
      defaultSections
    );

    insertStore.run(
      'store_jumla',
      'coop_jumla_organics',
      'जुम्ला रैथाने कोसेली घर',
      'Jumla Himalayan Heritage Store',
      'कर्णालीको शुद्ध मार्सी, सिमी र हिमाली घ्यू',
      'Authentic Karnali Marsi rice, organic beans, and mountain cow ghee',
      'himalayan_stone',
      '#B91C1C',
      '#15803D',
      'serif_editorial',
      '/images/product-mountain-ghee.jpg',
      '/images/banner-cooperative-artisan.jpg',
      'जुम्लाको अर्गानिक प्रमाणीकृत जिल्लाका १८० महिला तथा कृषि उद्यमीहरूको सहकारी स्टोर।',
      'Cooperative storefront uniting 180 organic growers in Jumla district.',
      'कर्णालीका रैथाने बालीको संरक्षण र राष्ट्रिय बजारमा पहुँच।',
      'Preserving indigenous Himalayan crops with transparent farmer earnings.',
      'अर्गानिक कर्णाली, समृद्ध किसान।',
      'Organic Karnali, prosperous mountain farmers.',
      'काठमाडौँ उपत्यकामा ३ दिनभित्र होम डेलिभरी सेवा।',
      '3-day dispatch delivery across Kathmandu Valley.',
      '© जुम्ला हिमाली अर्गानिक कृषि सहकारी लि.',
      '© Jumla Himalayan Organic Agro Coop Ltd.',
      '9800000102',
      'contact@jumlaorganics.coop.np',
      'चन्दननाथ-५, जुम्ला',
      defaultSections
    );

    insertStore.run(
      'store_palpa',
      'coop_palpa_dhaka',
      'पाल्पाली ढाका बुनाइ पसल',
      'Palpa Heritage Dhaka Loom',
      'हातले बुनिएका मौलिक पाल्पाली ढाका र अल्लो वस्त्र',
      'Handloom Palpali Dhaka shawls, topis, and natural Allo textiles',
      'palpa_crimson',
      '#991B1B',
      '#0F172A',
      'serif_editorial',
      '/images/product-dhaka-shawl.jpg',
      '/images/banner-cooperative-artisan.jpg',
      'तानसेनका ९५ महिला बुनकरहरूको सीप र श्रममा आधारित सहकारी हस्तकला भण्डार।',
      'A women-led weaving cooperative representing 95 master artisans in Tansen, Palpa.',
      'परम्परागत तान बुनाइको संरक्षण र महिला आर्थिक सशक्तीकरण।',
      'Sustaining traditional handloom heritage and women artisan livelihoods.',
      'प्रत्येक नेपाली घरमा मौलिक हस्तकला।',
      'Authentic Nepali handloom craftsmanship in every home.',
      'थोक तथा विवाह कोसेली अर्डरका लागि विशेष छुट उपलब्ध छ।',
      'Custom bulk weaving available for ceremonial orders.',
      '© पाल्पा महिला ढाका तथा हस्तकला सहकारी लि.',
      '© Palpa Women Dhaka & Handicraft Coop Ltd.',
      '9800000103',
      'contact@palpadhaka.coop.np',
      'तानसेन-४, मखनटोल, पाल्पा',
      defaultSections
    );

    insertStore.run(
      'store_mustang',
      'coop_mustang_honey',
      'अन्नपूर्ण मह तथा डेरी',
      'Annapurna Honey & Mountain Dairy',
      'उच्च हिमाली जडीबुटीको शुद्ध मह र दुग्ध परिकार',
      'Raw wildflower cliff honey and pure Himalayan dairy',
      'mustang_slate',
      '#B45309',
      '#15803D',
      'modern_outfit',
      '/images/product-himalayan-honey.jpg',
      '/images/hero-nepal-cooperative.jpg',
      'अन्नपूर्ण संरक्षण क्षेत्रका मौरीपालक र पशुपालक किसानहरूको संयुक्त सहकारी।',
      'Community beekeepers and alpine dairy farmers from the Annapurna foothills.',
      'प्राकृतिक र मिसावट-रहित हिमाली मह तथा दुग्ध उत्पादनको प्रवर्द्धन।',
      '100% raw, lab-verified honey and mountain dairy without additives.',
      'स्वस्थ जीवनका लागि शुद्ध हिमाली आहार।',
      'Pure Himalayan nutrition for healthy households.',
      'शीशाको जारमा सुरक्षित प्याकेजिङ सहित देशभर पठाइन्छ।',
      'Dispatched nationwide in sealed glass jars.',
      '© अन्नपूर्ण हिमाली मौरीपालन तथा दुग्ध सहकारी लि.',
      '© Annapurna Beekeepers & Dairy Coop Ltd.',
      '9800000104',
      'contact@mustangfruit.coop.np',
      'अन्नपूर्ण-६, कास्की',
      defaultSections
    );

    // Delivery Configs
    const insertDeliv = db.prepare(`
      INSERT INTO delivery_configs (id, cooperative_id, delivery_areas_json, default_fee_npr, free_delivery_threshold_npr, minimum_order_npr, pickup_enabled, pickup_address_ne, pickup_address_en, delivery_instructions_ne, bank_payment_instructions_ne)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `);
    insertDeliv.run(
      'del_ilam',
      'coop_ilam_tea',
      JSON.stringify(['काठमाडौँ उपत्यका', 'इलाम', 'झापा', 'मोरङ', 'पोखरा']),
      120,
      2000,
      300,
      'फिक्कल चोक, इलाम संकलन केन्द्र',
      'Fikkal Chowk Collection Center, Ilam',
      'अर्डर पुष्टि भएको २४ घण्टाभित्र कुरियर मार्फत पठाइन्छ।',
      'ग्लोबल आइएमई बैंक — खाता नं: 0450101000291 (इलाम हरित चिया सहकारी)'
    );
    insertDeliv.run(
      'del_jumla',
      'coop_jumla_organics',
      JSON.stringify(['काठमाडौँ उपत्यका', 'सुर्खेत', 'नेपालगञ्ज', 'जुम्ला', 'पोखरा']),
      150,
      3000,
      500,
      'खलङ्गा बजार, जुम्ला डिपो',
      'Khalanga Bazar Depot, Jumla',
      'हिमाली ढुवानीका कारण २–४ कार्यदिन लाग्न सक्छ।',
      'राष्ट्रिय वाणिज्य बैंक — खाता नं: 4090100048120 (जुम्ला अर्गानिक सहकारी)'
    );
    insertDeliv.run(
      'del_palpa',
      'coop_palpa_dhaka',
      JSON.stringify(['नेपालभर (All Nepal Courier)']),
      130,
      3500,
      400,
      'मखनटोल, तानसेन, पाल्पा',
      'Makhantol Loom House, Tansen, Palpa',
      'सुरक्षित कपडा प्याकेजिङमा देशभर पठाइन्छ।',
      'प्रभु बैंक — खाता नं: 112010089412 (पाल्पा महिला ढाका सहकारी)'
    );
    insertDeliv.run(
      'del_mustang',
      'coop_mustang_honey',
      JSON.stringify(['पोखरा', 'काठमाडौँ उपत्यका', 'बुटवल', 'चितवन']),
      120,
      2500,
      400,
      'नयाँबजार संकलन केन्द्र, पोखरा',
      'Nayabazar Center, Pokhara',
      'काँचको जार विशेष बबल-र्याप सहित पठाइन्छ।',
      'माछापुच्छ्रे बैंक — खाता नं: 221010077412 (अन्नपूर्ण मौरीपालन सहकारी)'
    );

    // Products
    const insertProd = db.prepare(`
      INSERT INTO products (
        id, cooperative_id, global_category_id, slug, sku, name_ne, name_en,
        description_ne, description_en, price_npr, discount_price_npr,
        unit_label_ne, unit_label_en, stock_quantity, low_stock_threshold,
        availability_status, origin_district, producer_name, is_featured, is_platform_featured, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_stock', ?, ?, ?, ?, 'published')
    `);
    const insertImg = db.prepare(`
      INSERT INTO product_images (id, product_id, cooperative_id, image_url, alt_text, is_primary)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const insertMove = db.prepare(`
      INSERT INTO inventory_movements (id, cooperative_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, note)
      VALUES (?, ?, ?, 'initial', ?, 0, ?, 'प्रारम्भिक स्टक प्रविष्टि')
    `);

    const seedProducts = [
      {
        id: 'prod_ilam_gold',
        coopId: 'coop_ilam_tea',
        catId: 'cat_tea',
        slug: 'ilam-orthodox-golden-tips-tea',
        sku: 'ILM-TEA-001',
        nameNe: 'इलाम अर्थोडक्स गोल्डेन टिप्स चिया',
        nameEn: 'Ilam Orthodox Golden Tips Loose Leaf Tea',
        descNe: '१,८०० मिटर उचाइमा हातले टिपिएको पहिलो बालीको शुद्ध अर्गानिक चिया। प्राकृतिक लोक्ता कागजको थैलीमा प्याक गरिएको।',
        descEn: 'Hand-plucked single-origin spring first flush orthodox tea from 1,800m elevation in Suryodaya, packed in handmade Lokta paper.',
        price: 850,
        discount: 760,
        unitNe: '१०० ग्राम',
        unitEn: '100g pouch',
        stock: 64,
        low: 10,
        origin: 'इलाम',
        producer: 'सूर्योदय महिला चिया समूह',
        featured: 1,
        platformFeatured: 1,
        img: '/images/product-ilam-tea.jpg',
      },
      {
        id: 'prod_ilam_green',
        coopId: 'coop_ilam_tea',
        catId: 'cat_tea',
        slug: 'ilam-highland-pearl-green-tea',
        sku: 'ILM-TEA-002',
        nameNe: 'इलाम हिमाली पर्ल ग्रीन टी',
        nameEn: 'Ilam Highland Pearl Organic Green Tea',
        descNe: 'एन्टिअक्सिडेन्टले भरिपूर्ण रासायनिक मल रहित हरियो चिया। बिहानको ताजापनका लागि उत्तम।',
        descEn: 'Steamed organic green tea rich in natural catechins, cultivated without synthetic pesticides.',
        price: 650,
        discount: null,
        unitNe: '१०० ग्राम',
        unitEn: '100g pouch',
        stock: 42,
        low: 8,
        origin: 'इलाम',
        producer: 'कन्याम चिया कृषक समूह',
        featured: 1,
        platformFeatured: 0,
        img: '/images/product-ilam-tea.jpg',
      },
      {
        id: 'prod_jumla_ghee',
        coopId: 'coop_jumla_organics',
        catId: 'cat_dairy',
        slug: 'jumla-mountain-cow-ghee',
        sku: 'JML-GHE-001',
        nameNe: 'जुम्ली पहाडी गाईको शुद्ध घ्यू',
        nameEn: 'Pure Jumla Mountain Cow Ghee',
        descNe: 'उच्च लेकाली घाँस र जडीबुटी चर्ने पहाडी गाईको दूधबाट परम्परागत मथनी विधिद्वारा तयार पारिएको शुद्ध दानेदार घ्यू।',
        descEn: 'Traditionally churned cultured bilona ghee from free-grazing alpine mountain cows in Jumla.',
        price: 1650,
        discount: 1490,
        unitNe: '५०० मि.लि. जार',
        unitEn: '500ml jar',
        stock: 38,
        low: 8,
        origin: 'जुम्ला',
        producer: 'चन्दननाथ पशुपालक महिला समूह',
        featured: 1,
        platformFeatured: 1,
        img: '/images/product-mountain-ghee.jpg',
      },
      {
        id: 'prod_jumla_simi',
        coopId: 'coop_jumla_organics',
        catId: 'cat_himal',
        slug: 'jumla-organic-rajma-simi-beans',
        sku: 'JML-SIM-002',
        nameNe: 'जुम्ली अर्गानिक रातो सिमी र बेसार कम्बो',
        nameEn: 'Jumla Organic Red Simi Beans & Turmeric',
        descNe: 'हिमाली सिँचाइमा उमारिएको मिठो रैथाने रातो सिमी र शुद्ध सल्यानी-जुम्ली बेसार।',
        descEn: 'Heirloom mountain red beans paired with sun-dried high-curcumin organic turmeric root.',
        price: 520,
        discount: 460,
        unitNe: '१ के.जी.',
        unitEn: '1 kg pack',
        stock: 85,
        low: 15,
        origin: 'जुम्ला',
        producer: 'तातोपानी कृषि उपज केन्द्र',
        featured: 1,
        platformFeatured: 1,
        img: '/images/product-mountain-ghee.jpg',
      },
      {
        id: 'prod_palpa_shawl',
        coopId: 'coop_palpa_dhaka',
        catId: 'cat_craft',
        slug: 'palpali-handwoven-dhaka-shawl',
        sku: 'PLP-DHK-001',
        nameNe: 'हातले बुनेको मौलिक पाल्पाली ढाका पछ्यौरा',
        nameEn: 'Authentic Handwoven Palpali Dhaka Shawl',
        descNe: 'तानसेनका अनुभवी बुनकर दिदीबहिनीहरूले परम्परागत काठको तानमा ७ दिन लगाएर बुनेको उच्च गुणस्तरीय सुती-रेशम ढाका सल।',
        descEn: 'Intricate geometric crimson and indigo handloom shawl woven over 7 days by Tansen women artisans.',
        price: 3800,
        discount: 3450,
        unitNe: '१ थान',
        unitEn: '1 piece',
        stock: 19,
        low: 5,
        origin: 'पाल्पा',
        producer: 'मखनटोल महिला बुनाइ समूह',
        featured: 1,
        platformFeatured: 1,
        img: '/images/product-dhaka-shawl.jpg',
      },
      {
        id: 'prod_palpa_muffler',
        coopId: 'coop_palpa_dhaka',
        catId: 'cat_craft',
        slug: 'palpa-dhaka-heritage-stole',
        sku: 'PLP-DHK-002',
        nameNe: 'पाल्पाली ढाका स्टोल तथा गलबन्दी',
        nameEn: 'Palpa Dhaka Handloom Heritage Stole',
        descNe: 'दैनिक पहिरन र औपचारिक कार्यक्रमका लागि हलुका, नरम र टिकाउ ढाका स्टोल।',
        descEn: 'Lightweight, breathable handwoven cotton Dhaka stole ideal for ceremonial and everyday wear.',
        price: 1950,
        discount: null,
        unitNe: '१ थान',
        unitEn: '1 piece',
        stock: 27,
        low: 5,
        origin: 'पाल्पा',
        producer: 'श्रीनगर हस्तकला इकाई',
        featured: 1,
        platformFeatured: 0,
        img: '/images/product-dhaka-shawl.jpg',
      },
      {
        id: 'prod_mustang_honey',
        coopId: 'coop_mustang_honey',
        catId: 'cat_dairy',
        slug: 'annapurna-wildflower-raw-honey',
        sku: 'ANN-HNY-001',
        nameNe: 'अन्नपूर्ण हिमाली जडीबुटीको काँचो मह',
        nameEn: 'Annapurna Raw Himalayan Wildflower Honey',
        descNe: 'लेकाली गुराँस, चिराइतो र जंगली फूलहरूबाट संकलित नतताइएको, शतप्रतिशत शुद्ध कच्चा मह।',
        descEn: 'Unheated, unfiltered raw mountain honey harvested from high-altitude Himalayan wildflowers.',
        price: 1350,
        discount: 1200,
        unitNe: '३५० ग्राम जार',
        unitEn: '350g glass jar',
        stock: 52,
        low: 10,
        origin: 'कास्की',
        producer: 'घान्द्रुक मौरीपालक समूह',
        featured: 1,
        platformFeatured: 1,
        img: '/images/product-himalayan-honey.jpg',
      },
      {
        id: 'prod_mustang_comb_honey',
        coopId: 'coop_mustang_honey',
        catId: 'cat_himal',
        slug: 'himalayan-bee-comb-honey-reserve',
        sku: 'ANN-HNY-002',
        nameNe: 'चाका सहितको हिमाली विशेष मह',
        nameEn: 'Himalayan Honeycomb Reserve Honey',
        descNe: 'प्राकृतिक मौरीको चाका सहित प्याक गरिएको विशेष मौसमी संकलन।',
        descEn: 'Seasonal limited-harvest raw honey with natural edible beeswax comb.',
        price: 1850,
        discount: null,
        unitNe: '५०० ग्राम जार',
        unitEn: '500g glass jar',
        stock: 14,
        low: 4,
        origin: 'कास्की',
        producer: 'अन्नपूर्ण मौरी संरक्षण इकाई',
        featured: 1,
        platformFeatured: 0,
        img: '/images/product-himalayan-honey.jpg',
      },
    ];

    for (const p of seedProducts) {
      insertProd.run(
        p.id,
        p.coopId,
        p.catId,
        p.slug,
        p.sku,
        p.nameNe,
        p.nameEn,
        p.descNe,
        p.descEn,
        p.price,
        p.discount,
        p.unitNe,
        p.unitEn,
        p.stock,
        p.low,
        p.origin,
        p.producer,
        p.featured,
        p.platformFeatured
      );
      insertImg.run(`img_${p.id}`, p.id, p.coopId, p.img, p.nameEn);
      insertMove.run(`mov_${p.id}`, p.coopId, p.id, p.stock, p.stock);
    }

    // Platform settings
    const insertSetting = db.prepare(`
      INSERT OR IGNORE INTO platform_settings (key, value_json) VALUES (?, ?)
    `);
    insertSetting.run(
      'branding',
      JSON.stringify({
        name_ne: 'सहकारी बजार',
        name_en: 'Sahakari Bazar',
        tagline_ne: 'नेपालको राष्ट्रिय बहु-सहकारी डिजिटल बजार',
        tagline_en: "Nepal's National Multi-Cooperative Marketplace",
        default_language: 'ne',
        currency: 'NPR',
        timezone: 'Asia/Kathmandu',
        announcement_ne: 'स्वीकृत नेपाली सहकारी संस्थाहरूका लागि ३० दिने निःशुल्क परीक्षण सदस्यता खुला छ।',
        announcement_en: '30-day introductory free trial open for registered Nepali cooperatives.',
        prohibited_keywords: ['weapon', 'tobacco', 'alcohol', 'illegal', 'हतियार', 'मदिरा', 'सुर्ती'],
      })
    );
  }
}

// Allow running directly via `npm run db:seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase();
  console.log('Sahakari Bazar database seeded successfully.');
}
