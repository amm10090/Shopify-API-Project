import React, { useState, useCallback, useEffect } from 'react';
import {
    Card,
    BlockStack,
    InlineStack,
    Text,
    TextField,
    Select,
    Checkbox,
    Button,
    RangeSlider,
    Badge,
    Divider,
} from '@shopify/polaris';
import { SearchIcon, FilterIcon } from '@shopify/polaris-icons';
import { ProductFilters, Brand } from '@shared/types';
import { brandApi } from '../services/api';

interface FilterPanelProps {
    filters: ProductFilters;
    onFiltersChange: (filters: ProductFilters) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({ filters, onFiltersChange }) => {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(false);
    const [keywordInput, setKeywordInput] = useState('');
    const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
    const [selectedBrands, setSelectedBrands] = useState<string[]>(filters.brands || []);
    const [availabilityFilter, setAvailabilityFilter] = useState<string>(
        filters.availability === undefined ? 'all' : filters.availability ? 'available' : 'unavailable'
    );

    // Load brands on component mount
    useEffect(() => {
        const loadBrands = async () => {
            setLoading(true);
            try {
                const response = await brandApi.getBrands();
                setBrands(response.data || []);
            } catch (error) {
                console.error('Failed to load brands:', error);
            } finally {
                setLoading(false);
            }
        };

        loadBrands();
    }, []);

    // Initialize price range from filters
    useEffect(() => {
        if (filters.priceRange) {
            setPriceRange([filters.priceRange.min, filters.priceRange.max]);
        }
    }, [filters.priceRange]);

    // Initialize keyword input from filters
    useEffect(() => {
        if (filters.keywords && filters.keywords.length > 0) {
            setKeywordInput(filters.keywords.join(', '));
        }
    }, [filters.keywords]);

    const handleKeywordChange = useCallback((value: string) => {
        setKeywordInput(value);
    }, []);

    const handleKeywordSubmit = useCallback(() => {
        const keywords = keywordInput
            .split(',')
            .map(k => k.trim())
            .filter(k => k.length > 0);

        const newFilters: ProductFilters = {
            ...filters,
            keywords: keywords.length > 0 ? keywords : undefined,
        };

        onFiltersChange(newFilters);
    }, [keywordInput, filters, onFiltersChange]);

    const handleBrandChange = useCallback((brandId: string, checked: boolean) => {
        let newSelectedBrands: string[];

        if (checked) {
            newSelectedBrands = [...selectedBrands, brandId];
        } else {
            newSelectedBrands = selectedBrands.filter(id => id !== brandId);
        }

        setSelectedBrands(newSelectedBrands);

        const newFilters: ProductFilters = {
            ...filters,
            brands: newSelectedBrands.length > 0 ? newSelectedBrands : undefined,
        };

        onFiltersChange(newFilters);
    }, [selectedBrands, filters, onFiltersChange]);

    const handlePriceRangeChange = useCallback((value: [number, number]) => {
        setPriceRange(value);
    }, []);

    const handlePriceRangeCommit = useCallback(() => {
        const newFilters: ProductFilters = {
            ...filters,
            priceRange: {
                min: priceRange[0],
                max: priceRange[1],
            },
        };

        onFiltersChange(newFilters);
    }, [priceRange, filters, onFiltersChange]);

    const handleAvailabilityChange = useCallback((value: string) => {
        setAvailabilityFilter(value);

        let availability: boolean | undefined;
        if (value === 'available') {
            availability = true;
        } else if (value === 'unavailable') {
            availability = false;
        } else {
            availability = undefined;
        }

        const newFilters: ProductFilters = {
            ...filters,
            availability,
        };

        onFiltersChange(newFilters);
    }, [filters, onFiltersChange]);

    const handleClearFilters = useCallback(() => {
        setKeywordInput('');
        setPriceRange([0, 1000]);
        setSelectedBrands([]);
        setAvailabilityFilter('all');

        onFiltersChange({
            keywords: undefined,
            brands: undefined,
            availability: undefined,
            priceRange: undefined,
            categories: undefined,
        });
    }, [onFiltersChange]);

    const getActiveFiltersCount = () => {
        let count = 0;
        if (filters.keywords && filters.keywords.length > 0) count++;
        if (filters.brands && filters.brands.length > 0) count++;
        if (filters.availability !== undefined) count++;
        if (filters.priceRange) count++;
        return count;
    };

    const brandOptions = brands
        .filter(brand => brand.isActive)
        .map(brand => ({
            label: `${brand.name} (${brand.apiType.toUpperCase()})`,
            value: brand.id,
        }));

    const availabilityOptions = [
        { label: 'All Products', value: 'all' },
        { label: 'In Stock', value: 'available' },
        { label: 'Out of Stock', value: 'unavailable' },
    ];

    return (
        <Card>
            <BlockStack gap="400">
                {/* Header */}
                <InlineStack align="space-between">
                    <InlineStack gap="200" align="center">
                        <FilterIcon />
                        <Text as="h2" variant="headingMd">
                            Filters
                        </Text>
                        {getActiveFiltersCount() > 0 && (
                            <Badge tone="info">
                                {`${getActiveFiltersCount()} active`}
                            </Badge>
                        )}
                    </InlineStack>
                    <Button
                        variant="plain"
                        size="slim"
                        onClick={handleClearFilters}
                        disabled={getActiveFiltersCount() === 0}
                    >
                        Clear All
                    </Button>
                </InlineStack>

                <Divider />

                {/* Keywords Search */}
                <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                        Search Keywords
                    </Text>
                    <InlineStack gap="200">
                        <div style={{ flex: 1 }}>
                            <TextField
                                label=""
                                labelHidden
                                value={keywordInput}
                                onChange={handleKeywordChange}
                                placeholder="Enter keywords separated by commas"
                                autoComplete="off"
                            />
                        </div>
                        <Button
                            icon={SearchIcon}
                            onClick={handleKeywordSubmit}
                            disabled={!keywordInput.trim()}
                        >
                            Search
                        </Button>
                    </InlineStack>
                    {filters.keywords && filters.keywords.length > 0 && (
                        <InlineStack gap="100">
                            {filters.keywords.map((keyword, index) => (
                                <Badge key={index} tone="info">
                                    {keyword}
                                </Badge>
                            ))}
                        </InlineStack>
                    )}
                </BlockStack>

                <Divider />

                {/* Brand Filter */}
                <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                        Brands
                    </Text>
                    {loading ? (
                        <Text as="p" variant="bodySm" tone="subdued">
                            Loading brands...
                        </Text>
                    ) : (
                        <BlockStack gap="100">
                            {brandOptions.map((option) => (
                                <Checkbox
                                    key={option.value}
                                    label={option.label}
                                    checked={selectedBrands.includes(option.value)}
                                    onChange={(checked) => handleBrandChange(option.value, checked)}
                                />
                            ))}
                            {brandOptions.length === 0 && (
                                <Text as="p" variant="bodySm" tone="subdued">
                                    No active brands found
                                </Text>
                            )}
                        </BlockStack>
                    )}
                </BlockStack>

                <Divider />

                {/* Price Range Filter */}
                <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                        Price Range
                    </Text>
                    <RangeSlider
                        label=""
                        labelHidden
                        value={priceRange}
                        min={0}
                        max={1000}
                        step={10}
                        onChange={handlePriceRangeChange}
                        output
                        prefix="$"
                    />
                    <InlineStack gap="200">
                        <Text as="p" variant="bodySm" tone="subdued">
                            ${priceRange[0]} - ${priceRange[1]}
                        </Text>
                    </InlineStack>
                </BlockStack>

                <Divider />

                {/* Availability Filter */}
                <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                        Stock Status
                    </Text>
                    <Select
                        label=""
                        labelHidden
                        options={availabilityOptions}
                        value={availabilityFilter}
                        onChange={handleAvailabilityChange}
                    />
                </BlockStack>
            </BlockStack>
        </Card>
    );
}; 