import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:shimmer/shimmer.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/widgets/loading_widget.dart';
import 'package:spa_shared/widgets/empty_state_widget.dart';
import '../../bloc/shop/shop_bloc.dart';
import '../../bloc/shop/shop_event.dart';
import '../../bloc/shop/shop_state.dart';
import '../../bloc/cart/cart_bloc.dart';
import '../../bloc/cart/cart_event.dart';
import '../../widgets/product_card.dart';
import '../../widgets/product_filter_sheet.dart';

class ShopScreen extends StatefulWidget {
  const ShopScreen({super.key});

  @override
  State<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends State<ShopScreen>
    with AutomaticKeepAliveClientMixin, WidgetsBindingObserver {
  String _selectedCategory = 'all';
  String _searchQuery = '';
  bool _isSearching = false;
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _isLoadingMore = false;
  int _currentPage = 1;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadProducts();

    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 200) {
        _loadMoreProducts();
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      context.read<ShopBloc>().add(const LoadCategoriesEvent());
    }
  }

  void _loadProducts() {
    context.read<ShopBloc>().add(
      LoadProductsEvent(
        category: _selectedCategory == 'all' ? null : _selectedCategory,
        search: _searchQuery.isEmpty ? null : _searchQuery,
        page: 1,
      ),
    );
    _currentPage = 1;
  }

  void _loadMoreProducts() {
    if (_isLoadingMore) return;
    final state = context.read<ShopBloc>().state;
    if (state is ProductsLoaded && state.hasMore) {
      setState(() {
        _isLoadingMore = true;
      });
      _currentPage++;
      context.read<ShopBloc>().add(
        LoadProductsEvent(
          category: _selectedCategory == 'all' ? null : _selectedCategory,
          search: _searchQuery.isEmpty ? null : _searchQuery,
          page: _currentPage,
          isLoadMore: true,
        ),
      );
    }
  }

  void _onCategorySelected(String category) {
    setState(() {
      _selectedCategory = category;
    });
    _loadProducts();
  }

  void _onSearchSubmitted(String query) {
    setState(() {
      _searchQuery = query;
      _isSearching = false;
    });
    _loadProducts();
  }

  void _clearSearch() {
    setState(() {
      _searchQuery = '';
      _searchController.clear();
      _isSearching = false;
    });
    _loadProducts();
  }

  void _navigateToProductDetail(String productId) {
    Navigator.pushNamed(
      context,
      '/product-detail',
      arguments: productId,
    ).then((_) => _loadProducts());
  }

  void _navigateToCart() {
    Navigator.pushNamed(context, '/cart');
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Shop',
          style: GoogleFonts.playfairDisplay(
            fontSize: 22,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          BlocBuilder<CartBloc, CartState>(
            builder: (context, cartState) {
              final itemCount = cartState is CartLoaded
                  ? cartState.items.fold<int>(0, (sum, item) => sum + item.quantity)
                  : 0;

              return Stack(
                children: [
                  IconButton(
                    icon: const Icon(Icons.shopping_cart_outlined),
                    onPressed: _navigateToCart,
                  ),
                  if (itemCount > 0)
                    Positioned(
                      right: 6,
                      top: 6,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(
                          color: Colors.red,
                          shape: BoxShape.circle,
                        ),
                        constraints: const BoxConstraints(
                          minWidth: 18,
                          minHeight: 18,
                        ),
                        child: Text(
                          itemCount > 99 ? '99+' : '$itemCount',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
      body: BlocConsumer<ShopBloc, ShopState>(
        listener: (context, state) {
          if (state is ShopError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: Colors.red,
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
          if (state is ProductsLoaded) {
            setState(() {
              _isLoadingMore = false;
            });
          }
        },
        builder: (context, state) {
          return Column(
            children: [
              // Search Bar
              _buildSearchBar(),

              // Categories
              _buildCategories(state),

              const SizedBox(height: 8),

              // Products
              Expanded(
                child: _buildProducts(state),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
        ),
        child: Row(
          children: [
            const Padding(
              padding: EdgeInsets.only(left: 12),
              child: Icon(
                Icons.search,
                color: AppColors.textSecondary,
                size: 20,
              ),
            ),
            Expanded(
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Tìm sản phẩm...',
                  hintStyle: GoogleFonts.inter(
                    color: AppColors.textSecondary,
                    fontSize: 14,
                  ),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 12,
                  ),
                ),
                onSubmitted: _onSearchSubmitted,
                onChanged: (text) {
                  if (text.isEmpty) {
                    _clearSearch();
                  }
                },
              ),
            ),
            if (_searchController.text.isNotEmpty)
              IconButton(
                icon: const Icon(
                  Icons.clear,
                  size: 18,
                  color: AppColors.textSecondary,
                ),
                onPressed: _clearSearch,
              ),
            IconButton(
              icon: const Icon(
                Icons.filter_list,
                color: AppColors.primary,
                size: 22,
              ),
              onPressed: _showFilterSheet,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategories(ShopState state) {
    final categories = state is CategoriesLoaded
        ? state.categories
        : <dynamic>[];

    return SizedBox(
      height: 44,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: categories.length + 1, // +1 for "All"
        itemBuilder: (context, index) {
          if (index == 0) {
            return _CategoryChip(
              label: 'Tất cả',
              isSelected: _selectedCategory == 'all',
              icon: Icons.apps,
              onTap: () => _onCategorySelected('all'),
            );
          }

          final category = categories[index - 1];
          return _CategoryChip(
            label: category.name,
            isSelected: _selectedCategory == category.id,
            icon: category.icon != null ? IconData(category.icon.codePoint, fontFamily: category.icon.fontFamily) : Icons.category,
            onTap: () => _onCategorySelected(category.id),
          );
        },
      ),
    );
  }

  Widget _buildProducts(ShopState state) {
    if (state is ShopLoading && state.isInitial) {
      return const _ProductGridShimmer();
    }

    if (state is ShopError && state.isInitial) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.error_outline,
              size: 48,
              color: Colors.red,
            ),
            const SizedBox(height: 16),
            Text(
              state.message,
              style: GoogleFonts.inter(
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadProducts,
              child: const Text('Thử lại'),
            ),
          ],
        ),
      );
    }

    if (state is ProductsLoaded) {
      if (state.products.isEmpty && state is! ProductsLoading) {
        return const EmptyStateWidget(
          icon: Icons.shopping_bag_outlined,
          title: 'Không tìm thấy sản phẩm',
          message: 'Thử tìm kiếm với từ khóa khác hoặc xem danh mục khác',
        );
      }

      return GridView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 0.65,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
        ),
        itemCount: state.products.length + (state.hasMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == state.products.length && state.hasMore) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(),
              ),
            );
          }

          final product = state.products[index];
          return ProductCard(
            id: product.id,
            name: product.name,
            price: product.price,
            imageUrl: product.imageUrl,
            brand: product.brand,
            isOnSale: product.isOnSale,
            discountPrice: product.discountPrice,
            rating: product.rating,
            onTap: () => _navigateToProductDetail(product.id),
            onAddToCart: () => _addToCart(product),
          );
        },
      );
    }

    return const SizedBox.shrink();
  }

  void _addToCart(dynamic product) {
    context.read<CartBloc>().add(
      AddToCartEvent(
        productId: product.id,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        quantity: 1,
      ),
    );
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Đã thêm ${product.name} vào giỏ hàng'),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
        action: SnackBarAction(
          label: 'Xem giỏ',
          onPressed: _navigateToCart,
          textColor: Colors.white,
        ),
      ),
    );
  }

  void _showFilterSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => ProductFilterSheet(
        currentCategory: _selectedCategory,
        onApply: (category, minPrice, maxPrice, sortBy) {
          // Apply filters and reload
          _loadProducts();
          Navigator.pop(context);
        },
      ),
    );
  }
}

// ==========================================
// CATEGORY CHIP
// ==========================================
class _CategoryChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final IconData? icon;
  final VoidCallback onTap;

  const _CategoryChip({
    required this.label,
    required this.isSelected,
    this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.primary : AppColors.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isSelected ? AppColors.primary : AppColors.divider,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(
                  icon,
                  size: 16,
                  color: isSelected ? Colors.white : AppColors.textSecondary,
                ),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: GoogleFonts.inter(
                  color: isSelected ? Colors.white : AppColors.textSecondary,
                  fontSize: 13,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ==========================================
// PRODUCT GRID SHIMMER
// ==========================================
class _ProductGridShimmer extends StatelessWidget {
  const _ProductGridShimmer();

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: Colors.grey[300]!,
      highlightColor: Colors.grey[100]!,
      child: GridView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 0.65,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
        ),
        itemCount: 6,
        itemBuilder: (context, index) => Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
    );
  }
}