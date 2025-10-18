import { db } from "../db";
import { assessments, results, users, benchmarks, dimensions, settings } from "../../shared/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";

interface BenchmarkConfig {
  minSampleSizeOverall: number;
  minSampleSizeIndustry: number;
  minSampleSizeCompanySize: number;
  minSampleSizeCountry: number;
  minSampleSizeIndustryCompanySize: number;
}

const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  minSampleSizeOverall: 5,
  minSampleSizeIndustry: 10,
  minSampleSizeCompanySize: 10,
  minSampleSizeCountry: 10,
  minSampleSizeIndustryCompanySize: 15,
};

export async function getBenchmarkConfig(): Promise<BenchmarkConfig> {
  const setting = await db.query.settings.findFirst({
    where: eq(settings.key, 'benchmark_config'),
  });

  if (setting?.value) {
    return { ...DEFAULT_BENCHMARK_CONFIG, ...(setting.value as Partial<BenchmarkConfig>) };
  }

  return DEFAULT_BENCHMARK_CONFIG;
}

export async function setBenchmarkConfig(config: Partial<BenchmarkConfig>): Promise<void> {
  const currentConfig = await getBenchmarkConfig();
  const newConfig = { ...currentConfig, ...config };

  await db.insert(settings)
    .values({
      key: 'benchmark_config',
      value: newConfig as any,
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: newConfig as any,
        updatedAt: sql`now()`,
      },
    });
}

interface SegmentFilter {
  segmentType: string;
  industry?: string;
  companySize?: string;
  country?: string;
}

async function calculateSegmentBenchmark(
  modelId: string,
  filter: SegmentFilter,
  minSampleSize: number
): Promise<{ meanScore: number; dimensionScores: Record<string, number>; sampleSize: number } | null> {
  // Build WHERE conditions
  const conditions = [
    eq(assessments.modelId, modelId),
    eq(assessments.status, 'completed'),
    isNotNull(assessments.userId),
    sql`${assessments.importBatchId} IS NULL`, // Exclude imported anonymous data from benchmarks
  ];

  if (filter.industry) {
    conditions.push(eq(users.industry, filter.industry));
  }
  if (filter.companySize) {
    conditions.push(eq(users.companySize, filter.companySize));
  }
  if (filter.country) {
    conditions.push(eq(users.country, filter.country));
  }

  // Get all completed assessments with results for this segment
  const assessmentData = await db
    .select({
      assessmentId: assessments.id,
      overallScore: results.overallScore,
      dimensionScores: results.dimensionScores,
    })
    .from(assessments)
    .innerJoin(results, eq(results.assessmentId, assessments.id))
    .innerJoin(users, eq(users.id, assessments.userId))
    .where(and(...conditions));

  const sampleSize = assessmentData.length;

  // Check if we have enough data
  if (sampleSize < minSampleSize) {
    return null;
  }

  // Calculate mean overall score
  const totalScore = assessmentData.reduce((sum, item) => sum + item.overallScore, 0);
  const meanScore = Math.round(totalScore / sampleSize);

  // Calculate mean dimension scores
  const dimensionSums: Record<string, { total: number; count: number }> = {};
  
  assessmentData.forEach((item) => {
    const dimScores = item.dimensionScores as Record<string, number>;
    Object.entries(dimScores).forEach(([dimKey, score]) => {
      if (!dimensionSums[dimKey]) {
        dimensionSums[dimKey] = { total: 0, count: 0 };
      }
      dimensionSums[dimKey].total += score;
      dimensionSums[dimKey].count += 1;
    });
  });

  const dimensionScores: Record<string, number> = {};
  Object.entries(dimensionSums).forEach(([dimKey, data]) => {
    dimensionScores[dimKey] = Math.round(data.total / data.count);
  });

  return {
    meanScore,
    dimensionScores,
    sampleSize,
  };
}

export async function calculateBenchmarks(modelId: string): Promise<void> {
  const config = await getBenchmarkConfig();

  // Delete existing benchmarks for this model
  await db.delete(benchmarks).where(eq(benchmarks.modelId, modelId));

  // 1. Calculate overall benchmark
  const overallBenchmark = await calculateSegmentBenchmark(
    modelId,
    { segmentType: 'overall' },
    config.minSampleSizeOverall
  );

  if (overallBenchmark) {
    await db.insert(benchmarks).values({
      modelId,
      segmentType: 'overall',
      meanScore: overallBenchmark.meanScore,
      dimensionScores: overallBenchmark.dimensionScores,
      sampleSize: overallBenchmark.sampleSize,
    });
  }

  // 2. Get all unique industries, company sizes, and countries
  const uniqueSegments = await db
    .selectDistinct({
      industry: users.industry,
      companySize: users.companySize,
      country: users.country,
    })
    .from(users)
    .innerJoin(assessments, and(
      eq(assessments.userId, users.id),
      eq(assessments.modelId, modelId),
      eq(assessments.status, 'completed'),
      sql`${assessments.importBatchId} IS NULL`
    ));

  const industries = new Set<string>();
  const companySizes = new Set<string>();
  const countries = new Set<string>();

  uniqueSegments.forEach((seg) => {
    if (seg.industry) industries.add(seg.industry);
    if (seg.companySize) companySizes.add(seg.companySize);
    if (seg.country) countries.add(seg.country);
  });

  // 3. Calculate industry benchmarks
  for (const industry of Array.from(industries)) {
    const benchmark = await calculateSegmentBenchmark(
      modelId,
      { segmentType: 'industry', industry },
      config.minSampleSizeIndustry
    );

    if (benchmark) {
      await db.insert(benchmarks).values({
        modelId,
        segmentType: 'industry',
        industry,
        meanScore: benchmark.meanScore,
        dimensionScores: benchmark.dimensionScores,
        sampleSize: benchmark.sampleSize,
      });
    }
  }

  // 4. Calculate company size benchmarks
  for (const companySize of Array.from(companySizes)) {
    const benchmark = await calculateSegmentBenchmark(
      modelId,
      { segmentType: 'company_size', companySize },
      config.minSampleSizeCompanySize
    );

    if (benchmark) {
      await db.insert(benchmarks).values({
        modelId,
        segmentType: 'company_size',
        companySize,
        meanScore: benchmark.meanScore,
        dimensionScores: benchmark.dimensionScores,
        sampleSize: benchmark.sampleSize,
      });
    }
  }

  // 5. Calculate country benchmarks
  for (const country of Array.from(countries)) {
    const benchmark = await calculateSegmentBenchmark(
      modelId,
      { segmentType: 'country', country },
      config.minSampleSizeCountry
    );

    if (benchmark) {
      await db.insert(benchmarks).values({
        modelId,
        segmentType: 'country',
        country,
        meanScore: benchmark.meanScore,
        dimensionScores: benchmark.dimensionScores,
        sampleSize: benchmark.sampleSize,
      });
    }
  }

  // 6. Calculate industry + company size combination benchmarks
  const combinations = new Set<string>();
  uniqueSegments.forEach((seg) => {
    if (seg.industry && seg.companySize) {
      combinations.add(`${seg.industry}|${seg.companySize}`);
    }
  });

  for (const combo of Array.from(combinations)) {
    const [industry, companySize] = combo.split('|');
    const benchmark = await calculateSegmentBenchmark(
      modelId,
      { segmentType: 'industry_company_size', industry, companySize },
      config.minSampleSizeIndustryCompanySize
    );

    if (benchmark) {
      await db.insert(benchmarks).values({
        modelId,
        segmentType: 'industry_company_size',
        industry,
        companySize,
        meanScore: benchmark.meanScore,
        dimensionScores: benchmark.dimensionScores,
        sampleSize: benchmark.sampleSize,
      });
    }
  }
}

export async function getBenchmarksForUser(
  modelId: string,
  userProfile?: {
    industry?: string;
    companySize?: string;
    country?: string;
  }
): Promise<{
  overall?: { meanScore: number; dimensionScores: Record<string, number>; sampleSize: number };
  segments: Array<{
    type: string;
    label: string;
    meanScore: number;
    dimensionScores: Record<string, number>;
    sampleSize: number;
  }>;
}> {
  // Get overall benchmark
  const overallBenchmark = await db.query.benchmarks.findFirst({
    where: and(
      eq(benchmarks.modelId, modelId),
      eq(benchmarks.segmentType, 'overall')
    ),
  });

  const result: {
    overall?: { meanScore: number; dimensionScores: Record<string, number>; sampleSize: number };
    segments: Array<{
      type: string;
      label: string;
      meanScore: number;
      dimensionScores: Record<string, number>;
      sampleSize: number;
    }>;
  } = {
    segments: [],
  };

  if (overallBenchmark) {
    result.overall = {
      meanScore: overallBenchmark.meanScore,
      dimensionScores: (overallBenchmark.dimensionScores as Record<string, number>) || {},
      sampleSize: overallBenchmark.sampleSize,
    };
  }

  // Get user-specific segment benchmarks if profile is provided
  if (!userProfile) {
    return result;
  }

  // Try to get the most specific benchmark first (industry + company size)
  if (userProfile.industry && userProfile.companySize) {
    const combo = await db.query.benchmarks.findFirst({
      where: and(
        eq(benchmarks.modelId, modelId),
        eq(benchmarks.segmentType, 'industry_company_size'),
        eq(benchmarks.industry, userProfile.industry),
        eq(benchmarks.companySize, userProfile.companySize)
      ),
    });

    if (combo) {
      result.segments.push({
        type: 'industry_company_size',
        label: `${userProfile.industry} - ${userProfile.companySize}`,
        meanScore: combo.meanScore,
        dimensionScores: (combo.dimensionScores as Record<string, number>) || {},
        sampleSize: combo.sampleSize,
      });
    }
  }

  // Industry benchmark
  if (userProfile.industry) {
    const industryBenchmark = await db.query.benchmarks.findFirst({
      where: and(
        eq(benchmarks.modelId, modelId),
        eq(benchmarks.segmentType, 'industry'),
        eq(benchmarks.industry, userProfile.industry)
      ),
    });

    if (industryBenchmark) {
      result.segments.push({
        type: 'industry',
        label: userProfile.industry,
        meanScore: industryBenchmark.meanScore,
        dimensionScores: (industryBenchmark.dimensionScores as Record<string, number>) || {},
        sampleSize: industryBenchmark.sampleSize,
      });
    }
  }

  // Company size benchmark
  if (userProfile.companySize) {
    const sizeBenchmark = await db.query.benchmarks.findFirst({
      where: and(
        eq(benchmarks.modelId, modelId),
        eq(benchmarks.segmentType, 'company_size'),
        eq(benchmarks.companySize, userProfile.companySize)
      ),
    });

    if (sizeBenchmark) {
      result.segments.push({
        type: 'company_size',
        label: userProfile.companySize,
        meanScore: sizeBenchmark.meanScore,
        dimensionScores: (sizeBenchmark.dimensionScores as Record<string, number>) || {},
        sampleSize: sizeBenchmark.sampleSize,
      });
    }
  }

  // Country benchmark
  if (userProfile.country) {
    const countryBenchmark = await db.query.benchmarks.findFirst({
      where: and(
        eq(benchmarks.modelId, modelId),
        eq(benchmarks.segmentType, 'country'),
        eq(benchmarks.country, userProfile.country)
      ),
    });

    if (countryBenchmark) {
      result.segments.push({
        type: 'country',
        label: userProfile.country,
        meanScore: countryBenchmark.meanScore,
        dimensionScores: (countryBenchmark.dimensionScores as Record<string, number>) || {},
        sampleSize: countryBenchmark.sampleSize,
      });
    }
  }

  return result;
}

export async function getAllBenchmarksForModel(modelId: string) {
  return await db.query.benchmarks.findMany({
    where: eq(benchmarks.modelId, modelId),
    orderBy: (benchmarks, { asc }) => [asc(benchmarks.segmentType), asc(benchmarks.sampleSize)],
  });
}
