import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('开始添加默认品牌数据...');

    // CJ 品牌
    const cjBrands = [
        { name: "Canada Pet Care", apiType: "CJ", apiId: "4247933" },
        { name: "Dreo", apiType: "CJ", apiId: "6088764" },
        { name: "GeorgiaBoot.com", apiType: "CJ", apiId: "6284907" },
        { name: "Power Systems", apiType: "CJ", apiId: "3056145" },
        { name: "RockyBoots.com", apiType: "CJ", apiId: "6284903" },
        { name: "Trina Turk", apiType: "CJ", apiId: "5923714" },
        { name: "Xtratuf", apiType: "CJ", apiId: "5535819" },
    ];

    // Pepperjam 品牌
    const pepperjamBrands = [
        { name: "Le Creuset", apiType: "PEPPERJAM", apiId: "6200" },
        { name: "BOMBAS", apiType: "PEPPERJAM", apiId: "8171" },
        { name: "Ashworth Golf International LLC", apiType: "PEPPERJAM", apiId: "10135" },
    ];

    // 合并所有品牌
    const allBrands = [...cjBrands, ...pepperjamBrands];

    for (const brand of allBrands) {
        try {
            const existingBrand = await prisma.brand.findUnique({
                where: { name: brand.name }
            });

            if (existingBrand) {
                console.log(`品牌 "${brand.name}" 已存在，跳过...`);
                continue;
            }

            const createdBrand = await prisma.brand.create({
                data: {
                    name: brand.name,
                    apiType: brand.apiType as any,
                    apiId: brand.apiId,
                    isActive: true,
                }
            });

            console.log(`✅ 成功创建品牌: ${createdBrand.name} (${createdBrand.apiType})`);
        } catch (error) {
            console.error(`❌ 创建品牌 "${brand.name}" 失败:`, error);
        }
    }

    console.log('默认品牌数据添加完成！');
}

main()
    .catch((e) => {
        console.error('种子脚本执行失败:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    }); 